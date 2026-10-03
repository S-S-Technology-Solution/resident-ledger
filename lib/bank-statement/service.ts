import Decimal from "decimal.js";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { controlAccount } from "../control-accounts";
import type { ParsedStatement } from "./rhb";
import { candidatesFor, guessResident, type BookItem } from "./match";

export type MatchKind = "receipt" | "billPayment" | "cashEntry" | "refund";
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

/**
 * Bank-method book items, each with the statement line it is paired to, if any.
 * With `includeVoided`, voided receipts and cash entries come back too, carrying
 * the date their reversal was posted: until that date they are still in the
 * books, which the reconciliation of an earlier month must reflect.
 */
export async function bookItems(associationId = DEFAULT_ASSOCIATION_ID, { includeVoided = false } = {}) {
  const voided = includeVoided ? {} : { voided: false };
  const [receipts, payments, cash, refunds, matched] = await Promise.all([
    db.receipt.findMany({
      where: { associationId, method: "BANK", ...voided, isOpeningBalance: false },
      include: { resident: { select: { ownerName: true, unitAddress: true } } },
    }),
    db.billPayment.findMany({
      where: { method: "BANK", bill: { associationId, status: { not: "VOIDED" } } },
      include: { bill: { select: { invoiceNo: true, supplier: { select: { name: true } } } } },
    }),
    db.cashEntry.findMany({ where: { associationId, method: "BANK", ...voided } }),
    // Money paid back to residents by voucher leaves the bank like any payment.
    db.charge.findMany({
      where: { associationId, kind: "REFUND", method: "BANK", ...voided },
      include: { resident: { select: { ownerName: true, unitAddress: true } } },
    }),
    db.bankStatementLine.findMany({
      where: { matchKind: { in: ["receipt", "billPayment", "cashEntry", "refund"] }, statement: { associationId } },
      select: { matchKind: true, matchId: true, date: true, ref: true },
    }),
  ]);
  const lineFor = new Map(matched.map((m) => [`${m.matchKind}:${m.matchId}`, m]));
  const voidedEntryIds = [...receipts, ...cash, ...refunds].filter((x) => x.voided && x.entryId).map((x) => x.entryId!);
  const reversals = voidedEntryIds.length
    ? await db.journalEntry.findMany({ where: { reversesId: { in: voidedEntryIds } }, select: { reversesId: true, date: true } })
    : [];
  const reversedOn = new Map(reversals.map((r) => [r.reversesId!, r.date]));
  const voidedOn = (x: { voided: boolean; entryId: string | null; date: Date }) =>
    x.voided ? (x.entryId ? reversedOn.get(x.entryId) : undefined) ?? x.date : null;

  const items: (BookItem & { href: string; voidedOn: Date | null; line: { date: Date; ref: string } | null })[] = [
    ...receipts.map((r) => ({
      kind: "receipt" as const, id: r.id, date: r.date, amount: Number(r.amount), direction: "IN" as const,
      ref: r.receiptNo, label: `${r.resident.ownerName} — ${r.resident.unitAddress}`,
      bankRef: r.bankRef, chequeNo: null, residentId: r.residentId, href: `/receipts/${r.id}`, voidedOn: voidedOn(r),
    })),
    // A voucher paying several bills is one cheque: one item for its total.
    ...[...Map.groupBy(payments, (p) => p.entryId ?? p.id).entries()].map(([id, rows]) => ({
      kind: "billPayment" as const, id, date: rows[0].date,
      amount: rows.reduce((s, p) => s + Number(p.amount), 0), direction: "OUT" as const,
      ref: rows[0].voucherNo ?? rows[0].bill.invoiceNo,
      label: `${rows[0].bill.supplier.name} — ${rows.map((p) => p.bill.invoiceNo).join(", ")}`,
      bankRef: rows[0].bankRef, chequeNo: rows[0].chequeNo ?? rows[0].bankRef,
      href: rows[0].entryId ? `/bills/voucher/${rows[0].entryId}` : `/bills/${rows[0].billId}`, voidedOn: null,
    })),
    ...refunds.map((r) => ({
      kind: "refund" as const, id: r.id, date: r.date, amount: Number(r.amount), direction: "OUT" as const,
      ref: r.voucherNo ?? r.invoiceNo ?? "Refund", label: `Refund — ${r.resident.ownerName}, ${r.resident.unitAddress}`,
      bankRef: null, chequeNo: r.chequeNo, residentId: r.residentId, href: `/charges/${r.id}`, voidedOn: voidedOn(r),
    })),
    ...cash.map((c) => ({
      kind: "cashEntry" as const, id: c.id, date: c.date, amount: Number(c.amount), direction: c.direction,
      ref: c.refNo, label: c.counterparty ? `${c.counterparty} — ${c.description}` : c.description,
      bankRef: c.bankRef, chequeNo: c.chequeNo, href: `/cash-book/${c.id}`, voidedOn: voidedOn(c),
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
  // Bill payments are matched per voucher (its journal entry), covering every bill it paid.
  else if (kind === "billPayment") await db.billPayment.updateMany({ where: { OR: [{ entryId: id }, { id }] }, data });
  else if (kind === "refund") await db.charge.update({ where: { id }, data });
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

/**
 * Called before a book entry is voided: if a statement line is paired with it,
 * the pairing is released so the line shows as unmatched again. Refused when
 * that statement has been signed off — a reconciled month must not change
 * under the accountant's feet.
 */
export async function releaseLineFor(kind: MatchKind, itemId: string) {
  const line = await db.bankStatementLine.findFirst({
    where: { matchKind: kind, matchId: itemId },
    include: { statement: true },
  });
  if (!line) return;
  if (line.statement.reconciledAt) {
    throw new Error(
      `This entry is on the reconciled bank statement to ${iso(line.statement.periodTo)} (line ${line.ref}). Reopen that statement before voiding it.`,
    );
  }
  await db.bankStatementLine.update({ where: { id: line.id }, data: { matchKind: null, matchId: null, note: null } });
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
    bookItems(statement.associationId, { includeVoided: true }),
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

  // In the books at the date (posted by then, not yet reversed) and not through the bank by then.
  const outstanding = items.filter(
    (i) => i.date <= asAt && !(i.voidedOn && i.voidedOn <= asAt) && (!i.line || i.line.date > asAt),
  );
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
  const statement = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId } });
  const assoc = await db.association.findUniqueOrThrow({ where: { id: statement.associationId }, select: { lockedThrough: true } });
  await db.$transaction([
    db.bankStatement.update({ where: { id: statementId }, data: { reconciledAt: new Date(), reconciledBy: by } }),
    // A reconciled month is closed for posting: nothing can be entered or
    // backdated into it from any screen until the statement is reopened.
    ...(!assoc.lockedThrough || assoc.lockedThrough < statement.periodTo
      ? [db.association.update({ where: { id: statement.associationId }, data: { lockedThrough: statement.periodTo } })]
      : []),
  ]);
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
  const assoc = await db.association.findUniqueOrThrow({ where: { id: statement.associationId }, select: { lockedThrough: true } });
  const dayBefore = new Date(statement.periodFrom.getTime() - 86_400_000);
  await db.$transaction([
    db.bankStatement.update({ where: { id: statementId }, data: { reconciledAt: null, reconciledBy: null } }),
    // Open the month for posting again by pulling the lock back to the day before it.
    ...(assoc.lockedThrough && assoc.lockedThrough >= statement.periodFrom
      ? [db.association.update({ where: { id: statement.associationId }, data: { lockedThrough: dayBefore } })]
      : []),
  ]);
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
