import Decimal from "decimal.js";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { controlAccount } from "../control-accounts";
import type { ParsedStatement } from "./rhb";
import { candidatesFor, guessResident, type BookItem } from "./match";

export type MatchKind = "receipt" | "billPayment" | "cashEntry";
const NO_ENTRY = "none";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** B2602-005: bank, statement year-month, line number. Quoted on the book entry. */
function lineRef(periodTo: Date, lineNo: number) {
  const yy = String(periodTo.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(periodTo.getUTCMonth() + 1).padStart(2, "0");
  return `B${yy}${mm}-${String(lineNo).padStart(3, "0")}`;
}

/**
 * Saves a parsed statement. Refuses a period already uploaded, and one that
 * doesn't carry on from the statement before it — a gap or a changed balance
 * means a missing statement, which would make every later reconciliation wrong.
 */
export async function saveStatement(
  parsed: ParsedStatement,
  fileName: string,
  uploadedBy: string | null,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const existing = await db.bankStatement.findUnique({
    where: { associationId_accountNo_periodFrom: { associationId, accountNo: parsed.accountNo, periodFrom: parsed.periodFrom } },
  });
  if (existing) throw new Error(`The statement starting ${iso(parsed.periodFrom)} has already been uploaded.`);

  const previous = await db.bankStatement.findFirst({
    where: { associationId, accountNo: parsed.accountNo, periodTo: { lt: parsed.periodFrom } },
    orderBy: { periodTo: "desc" },
  });
  if (previous && !new Decimal(previous.closingBalance.toString()).eq(parsed.openingBalance)) {
    throw new Error(
      `This statement opens at RM ${parsed.openingBalance.toFixed(2)}, but the previous one (to ${iso(previous.periodTo)}) closed at RM ${new Decimal(previous.closingBalance.toString()).toFixed(2)}. Is a statement missing in between?`,
    );
  }
  if (!previous) {
    // The first statement must open at the bank balance carried into the books.
    const opening = await openingBookBalance(associationId);
    const later = await db.bankStatement.findFirst({ where: { associationId, accountNo: parsed.accountNo } });
    if (!later && !opening.eq(parsed.openingBalance)) {
      throw new Error(
        `This is the first statement, but it opens at RM ${parsed.openingBalance.toFixed(2)} while the bank balance brought forward in the books is RM ${opening.toFixed(2)}. Upload the statement that starts on the cut-over date first.`,
      );
    }
  }

  return db.bankStatement.create({
    data: {
      associationId,
      bank: parsed.bank,
      accountNo: parsed.accountNo,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      openingBalance: parsed.openingBalance.toFixed(2),
      closingBalance: parsed.closingBalance.toFixed(2),
      fileName,
      uploadedBy,
      lines: {
        create: parsed.lines.map((l) => ({
          lineNo: l.lineNo,
          ref: lineRef(parsed.periodTo, l.lineNo),
          date: l.date,
          type: l.type,
          serial: l.serial,
          details: l.details.join("\n"),
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          balance: l.balance.toFixed(2),
        })),
      },
    },
  });
}

/** Bank balance carried into the books by the opening-balance journal. */
async function openingBookBalance(associationId = DEFAULT_ASSOCIATION_ID) {
  const bank = await controlAccount("BANK", associationId);
  const sum = await db.journalLine.aggregate({
    where: { accountId: bank.id, entry: { associationId, source: "opening", status: "POSTED" } },
    _sum: { debit: true, credit: true },
  });
  return new Decimal(sum._sum.debit?.toString() ?? 0).minus(sum._sum.credit?.toString() ?? 0);
}

/** Bank-method book items, each with the statement line it is paired to, if any. */
export async function bookItems(associationId = DEFAULT_ASSOCIATION_ID) {
  const [receipts, payments, cash, matched] = await Promise.all([
    db.receipt.findMany({
      where: { associationId, method: "BANK", voided: false, isOpeningBalance: false },
      include: { resident: { select: { ownerName: true, unitAddress: true } } },
    }),
    db.billPayment.findMany({
      where: { method: "BANK", bill: { associationId, status: { not: "VOIDED" } } },
      include: { bill: { select: { invoiceNo: true, supplier: { select: { name: true } } } } },
    }),
    db.cashEntry.findMany({ where: { associationId, method: "BANK", voided: false } }),
    db.bankStatementLine.findMany({
      where: { matchKind: { in: ["receipt", "billPayment", "cashEntry"] }, statement: { associationId } },
      select: { matchKind: true, matchId: true, date: true, ref: true },
    }),
  ]);
  const lineFor = new Map(matched.map((m) => [`${m.matchKind}:${m.matchId}`, m]));

  const items: (BookItem & { href: string; line: { date: Date; ref: string } | null })[] = [
    ...receipts.map((r) => ({
      kind: "receipt" as const, id: r.id, date: r.date, amount: Number(r.amount), direction: "IN" as const,
      ref: r.receiptNo, label: `${r.resident.ownerName} — ${r.resident.unitAddress}`,
      bankRef: r.bankRef, chequeNo: null, residentId: r.residentId, href: `/receipts/${r.id}`,
    })),
    ...payments.map((p) => ({
      kind: "billPayment" as const, id: p.id, date: p.date, amount: Number(p.amount), direction: "OUT" as const,
      ref: p.bill.invoiceNo, label: p.bill.supplier.name, bankRef: p.bankRef, chequeNo: p.bankRef,
      href: `/bills/${p.billId}`,
    })),
    ...cash.map((c) => ({
      kind: "cashEntry" as const, id: c.id, date: c.date, amount: Number(c.amount), direction: c.direction,
      ref: c.refNo, label: c.counterparty ? `${c.counterparty} — ${c.description}` : c.description,
      bankRef: c.bankRef, chequeNo: c.chequeNo, href: `/cash-book/${c.id}`,
    })),
  ].map((i) => ({ ...i, line: lineFor.get(`${i.kind}:${i.id}`) ?? null }));
  return items;
}

async function assertEditable(lineId: string) {
  const line = await db.bankStatementLine.findUnique({ where: { id: lineId }, include: { statement: true } });
  if (!line) throw new Error("Statement line not found");
  if (line.statement.reconciledAt) {
    throw new Error("This statement has been marked reconciled. Reopen it before changing its lines.");
  }
  return line;
}

async function setCleared(kind: MatchKind, id: string, line: { date: Date; ref: string } | null) {
  const data = { cleared: line !== null, clearedAt: line?.date ?? null, statementRef: line?.ref ?? null };
  if (kind === "receipt") await db.receipt.update({ where: { id }, data });
  else if (kind === "billPayment") await db.billPayment.update({ where: { id }, data });
  else await db.cashEntry.update({ where: { id }, data });
}

/** Pairs a line with a book item after checking they are the same money. */
export async function matchLine(lineId: string, kind: MatchKind, itemId: string) {
  const line = await assertEditable(lineId);
  if (line.matchKind) throw new Error(`Line ${line.ref} is already matched.`);
  const item = (await bookItems(line.statement.associationId)).find((i) => i.kind === kind && i.id === itemId);
  if (!item) throw new Error("That book entry no longer exists or is voided.");
  if (item.line) throw new Error(`${item.ref} is already matched to statement line ${item.line.ref}.`);

  const isIn = Number(line.credit) > 0;
  const amount = isIn ? Number(line.credit) : Number(line.debit);
  if (item.direction !== (isIn ? "IN" : "OUT")) throw new Error("Money in can only match a receipt, and money out a payment.");
  if (Math.abs(item.amount - amount) >= 0.005) {
    throw new Error(`Amounts differ: the statement shows RM ${amount.toFixed(2)}, ${item.ref} is RM ${item.amount.toFixed(2)}.`);
  }

  await db.bankStatementLine.update({ where: { id: lineId }, data: { matchKind: kind, matchId: itemId, note: null } });
  await setCleared(kind, itemId, { date: line.date, ref: line.ref });
}

export async function unmatchLine(lineId: string) {
  const line = await assertEditable(lineId);
  if (line.matchKind && line.matchKind !== NO_ENTRY && line.matchId) {
    await setCleared(line.matchKind as MatchKind, line.matchId, null);
  }
  await db.bankStatementLine.update({ where: { id: lineId }, data: { matchKind: null, matchId: null, note: null } });
}

/** For a line with no book entry of its own, e.g. a bounced cheque presented again. */
export async function markNoEntry(lineId: string, note: string) {
  const line = await assertEditable(lineId);
  if (line.matchKind) throw new Error(`Line ${line.ref} is already matched.`);
  await db.bankStatementLine.update({ where: { id: lineId }, data: { matchKind: NO_ENTRY, note } });
}

/**
 * Pairs every unmatched line that has exactly one convincing candidate: a
 * cheque number or bank reference that agrees; failing that, a single receipt
 * from the resident the payer's note names; failing that, a single item of the
 * same amount within the date window. Anything ambiguous is left for a person.
 */
export async function autoMatch(statementId: string) {
  const statement = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId }, include: { lines: true } });
  if (statement.reconciledAt) throw new Error("This statement has been marked reconciled.");
  const [allItems, residents] = await Promise.all([
    bookItems(statement.associationId),
    db.resident.findMany({
      where: { associationId: statement.associationId },
      select: { id: true, debtorCode: true, unitAddress: true, ownerName: true },
    }),
  ]);
  const items = allItems.filter((i) => !i.line);
  const taken = new Set<string>();
  let matched = 0;
  for (const line of statement.lines.filter((l) => !l.matchKind)) {
    const credit = Number(line.credit);
    const guess = credit > 0 ? guessResident(line.details ? line.details.split("\n") : [], residents) : null;
    const cands = candidatesFor(
      { date: line.date, debit: Number(line.debit), credit, serial: line.serial },
      items.filter((i) => !taken.has(`${i.kind}:${i.id}`)),
      guess?.resident.id,
    ).filter((c) => c.refAgrees || c.score > 0);
    const byRef = cands.filter((c) => c.refAgrees);
    const byResident = cands.filter((c) => c.residentAgrees);
    const pick =
      byRef.length === 1 ? byRef[0]
      : byRef.length > 1 ? null
      : byResident.length === 1 ? byResident[0]
      : byResident.length === 0 && cands.length === 1 ? cands[0]
      : null;
    if (!pick) continue;
    await matchLine(line.id, pick.item.kind, pick.item.id);
    taken.add(`${pick.item.kind}:${pick.item.id}`);
    matched++;
  }
  return matched;
}

export type Reconciliation = Awaited<ReturnType<typeof reconciliation>>;

/**
 * The bank reconciliation statement as at the statement's closing date.
 *
 * An item counts as through the bank only if it is paired with a statement line
 * dated on or before the closing date, so the figures stay right for any month
 * even after later statements are uploaded.
 */
export async function reconciliation(statementId: string) {
  const statement = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId } });
  const asAt = statement.periodTo;
  const bank = await controlAccount("BANK", statement.associationId);

  const [items, bankLines, gl] = await Promise.all([
    bookItems(statement.associationId),
    db.bankStatementLine.findMany({
      where: {
        date: { lte: asAt },
        statement: { associationId: statement.associationId, accountNo: statement.accountNo },
        OR: [{ matchKind: null }, { matchKind: NO_ENTRY }],
      },
      orderBy: [{ date: "asc" }, { lineNo: "asc" }],
    }),
    db.journalLine.aggregate({
      // Voided entries stay in alongside their reversals so the two net to nil.
      where: { accountId: bank.id, entry: { associationId: statement.associationId, status: { not: "DRAFT" }, date: { lte: asAt } } },
      _sum: { debit: true, credit: true },
    }),
  ]);

  const outstanding = items.filter((i) => i.date <= asAt && (!i.line || i.line.date > asAt));
  const depositsInTransit = outstanding.filter((i) => i.direction === "IN");
  const unpresented = outstanding.filter((i) => i.direction === "OUT");
  const unmatched = bankLines.filter((l) => l.matchKind === null);
  const noEntry = bankLines.filter((l) => l.matchKind === NO_ENTRY);

  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s.plus(x.amount), new Decimal(0));
  const net = (ls: { credit: unknown; debit: unknown }[]) =>
    ls.reduce((s, l) => s.plus(String(l.credit)).minus(String(l.debit)), new Decimal(0));

  const bankBalance = new Decimal(statement.closingBalance.toString());
  const adjusted = bankBalance
    .plus(sum(depositsInTransit))
    .minus(sum(unpresented))
    .minus(net(noEntry))
    .minus(net(unmatched));
  const bookBalance = new Decimal(gl._sum.debit?.toString() ?? 0).minus(gl._sum.credit?.toString() ?? 0);

  return {
    asAt,
    bankBalance,
    depositsInTransit,
    unpresented,
    noEntry,
    unmatched,
    adjusted,
    bookBalance,
    difference: adjusted.minus(bookBalance),
    canSignOff: unmatched.length === 0 && adjusted.minus(bookBalance).abs().lt(0.005),
  };
}

export async function markReconciled(statementId: string, by: string | null) {
  const rec = await reconciliation(statementId);
  if (!rec.canSignOff) {
    throw new Error(
      rec.unmatched.length
        ? `${rec.unmatched.length} statement line(s) up to this date are still unmatched.`
        : `Bank and book differ by RM ${rec.difference.toFixed(2)}.`,
    );
  }
  await db.bankStatement.update({ where: { id: statementId }, data: { reconciledAt: new Date(), reconciledBy: by } });
}

export async function reopenStatement(statementId: string) {
  const statement = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId } });
  const later = await db.bankStatement.findFirst({
    where: {
      associationId: statement.associationId,
      accountNo: statement.accountNo,
      reconciledAt: { not: null },
      periodFrom: { gt: statement.periodTo },
    },
    orderBy: { periodFrom: "asc" },
  });
  if (later) throw new Error(`Reopen the later statement (${iso(later.periodFrom)}) first — it was reconciled on top of this one.`);
  await db.bankStatement.update({ where: { id: statementId }, data: { reconciledAt: null, reconciledBy: null } });
}

/** Removes an uploaded statement, releasing any book items paired with its lines. */
export async function deleteStatement(statementId: string) {
  const statement = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId }, include: { lines: true } });
  if (statement.reconciledAt) throw new Error("Reopen the statement before deleting it.");
  for (const l of statement.lines) {
    if (l.matchKind && l.matchKind !== NO_ENTRY && l.matchId) await setCleared(l.matchKind as MatchKind, l.matchId, null);
  }
  await db.bankStatement.delete({ where: { id: statementId } });
}
