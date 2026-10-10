import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { controlAccount } from "../control-accounts";
import type { ParsedStatement } from "./rhb";
import { candidatesFor, guessResident, type BookItem } from "./match";

export type MatchKind = "receipt" | "billPayment" | "cashEntry" | "refund" | "bf";
export type Pick = { kind: MatchKind; id: string };
const KINDS: MatchKind[] = ["receipt", "billPayment", "cashEntry", "refund", "bf"];
const NO_ENTRY = "none";
// One statement line covering several book items, listed in matchItems.
const MULTI = "multi";

type LineRow = { id: string; matchKind: string | null; matchId: string | null; matchItems: Prisma.JsonValue };
/** The book items a matched line stands for. */
function picksOf(line: LineRow): Pick[] {
  if (!line.matchKind || line.matchKind === NO_ENTRY) return [];
  if (line.matchKind === MULTI) return (line.matchItems as Pick[] | null) ?? [];
  return line.matchId ? [{ kind: line.matchKind as MatchKind, id: line.matchId }] : [];
}

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
    // Cheques and deposits brought forward account for any gap.
    const opening = await openingBookBalance(associationId);
    const bf = await db.bankBfItem.findMany({ where: { associationId } });
    const bfNet = bf.reduce((s, b) => (b.direction === "IN" ? s.plus(b.amount.toString()) : s.minus(b.amount.toString())), new Decimal(0));
    const later = await db.bankStatement.findFirst({ where: { associationId, accountNo: parsed.accountNo } });
    if (!later && !opening.eq(parsed.openingBalance.plus(bfNet))) {
      throw new Error(
        `This is the first statement, but it opens at RM ${parsed.openingBalance.toFixed(2)} while the bank balance brought forward in the books is RM ${opening.toFixed(2)}${bf.length ? ` (RM ${opening.minus(bfNet).toFixed(2)} after the brought-forward items)` : ""}. Upload the statement that starts on the cut-over date first, or add the cheques and deposits outstanding at the cut-over as brought-forward items.`,
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
  const [receipts, payments, cash, refunds, bf, matched] = await Promise.all([
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
    db.bankBfItem.findMany({ where: { associationId } }),
    db.bankStatementLine.findMany({
      where: { matchKind: { in: [...KINDS, MULTI] }, statement: { associationId } },
      select: { id: true, matchKind: true, matchId: true, matchItems: true, date: true, ref: true, debit: true, credit: true },
    }),
  ]);
  // Each item's clearing lines. A line split across several items credits each
  // with the item's own amount; lines sharing one item credit their own amounts.
  const linesFor = new Map<string, { date: Date; ref: string; amount: number | null }[]>();
  for (const m of matched) {
    const multi = m.matchKind === MULTI;
    for (const p of picksOf(m)) {
      const k = `${p.kind}:${p.id}`;
      linesFor.set(k, [...(linesFor.get(k) ?? []), { date: m.date, ref: m.ref, amount: multi ? null : Number(m.credit) + Number(m.debit) }]);
    }
  }
  const voidedEntryIds = [...receipts, ...cash, ...refunds].filter((x) => x.voided && x.entryId).map((x) => x.entryId!);
  const reversals = voidedEntryIds.length
    ? await db.journalEntry.findMany({ where: { reversesId: { in: voidedEntryIds } }, select: { reversesId: true, date: true } })
    : [];
  const reversedOn = new Map(reversals.map((r) => [r.reversesId!, r.date]));
  const voidedOn = (x: { voided: boolean; entryId: string | null; date: Date }) =>
    x.voided ? (x.entryId ? reversedOn.get(x.entryId) : undefined) ?? x.date : null;

  const raw: (BookItem & { href: string; voidedOn: Date | null })[] = [
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
    ...bf.map((b) => ({
      kind: "bf" as const, id: b.id, date: b.date, amount: Number(b.amount), direction: b.direction as "IN" | "OUT",
      ref: b.chequeNo ? `B/F chq ${b.chequeNo}` : "B/F", label: `Brought forward — ${b.description}`,
      bankRef: null, chequeNo: b.chequeNo, href: "/bank-statements#brought-forward", voidedOn: null,
    })),
  ];
  const items = raw.map((i) => {
    const lines = (linesFor.get(`${i.kind}:${i.id}`) ?? [])
      .map((l) => ({ date: l.date, ref: l.ref, amount: l.amount ?? i.amount }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    // `line` is the last line that cleared it — null while nothing has.
    return { ...i, lines, line: lines.at(-1) ?? null };
  });
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
  // Brought-forward items post nothing, so there is no document to mark.
  if (kind === "bf") return;
  const data = { cleared: line !== null, clearedAt: line?.date ?? null, statementRef: line?.ref ?? null };
  if (kind === "receipt") await db.receipt.update({ where: { id }, data });
  // Bill payments are matched per voucher (its journal entry), covering every bill it paid.
  else if (kind === "billPayment") await db.billPayment.updateMany({ where: { OR: [{ entryId: id }, { id }] }, data });
  else if (kind === "refund") await db.charge.update({ where: { id }, data });
  else await db.cashEntry.update({ where: { id }, data });
}

/** Pairs a line with a book item after checking they are the same money. */
export async function matchLine(lineId: string, kind: MatchKind, itemId: string) {
  await matchLines([lineId], [{ kind, id: itemId }]);
}

/**
 * Pairs statement lines with book items when the totals agree: one with one,
 * several book items paid in as one deposit, or one book item the bank split
 * over several lines (e.g. a RM 3,000 receipt credited as 2,880 + 120).
 */
export async function matchLines(lineIds: string[], picks: Pick[]) {
  lineIds = [...new Set(lineIds)];
  if (!lineIds.length || !picks.length) throw new Error("Choose at least one statement line and one book entry.");
  if (lineIds.length > 1 && picks.length > 1) {
    throw new Error("Match one book entry with several lines, or several entries with one line — not both at once.");
  }
  const lines = await Promise.all(lineIds.map(assertEditable));
  for (const l of lines) if (l.matchKind) throw new Error(`Line ${l.ref} is already matched.`);
  const isIn = Number(lines[0].credit) > 0;
  if (lines.some((l) => Number(l.credit) > 0 !== isIn)) throw new Error("Money in and money out can't be matched together.");

  const all = await bookItems(lines[0].statement.associationId);
  const items = picks.map((p) => {
    const item = all.find((i) => i.kind === p.kind && i.id === p.id);
    if (!item) throw new Error("A book entry chosen no longer exists or is voided.");
    if (item.line) throw new Error(`${item.ref} is already matched to statement line ${item.line.ref}.`);
    if (item.direction !== (isIn ? "IN" : "OUT")) throw new Error("Money in can only match a receipt, and money out a payment.");
    return item;
  });
  if (new Set(items.map((i) => `${i.kind}:${i.id}`)).size !== items.length) throw new Error("The same book entry was chosen twice.");

  const lineTotal = lines.reduce((s, l) => s.plus(isIn ? l.credit.toString() : l.debit.toString()), new Decimal(0));
  const itemTotal = items.reduce((s, i) => s.plus(i.amount), new Decimal(0));
  if (!lineTotal.eq(itemTotal.toDecimalPlaces(2))) {
    const what = items.length === 1 ? items[0].ref : `the ${items.length} entries`;
    throw new Error(`Amounts differ: the statement shows RM ${lineTotal.toFixed(2)}, ${what} ${items.length === 1 ? "is" : "come to"} RM ${itemTotal.toFixed(2)}.`);
  }

  if (items.length === 1) {
    await db.bankStatementLine.updateMany({
      where: { id: { in: lineIds } },
      data: { matchKind: items[0].kind, matchId: items[0].id, note: null },
    });
  } else {
    await db.bankStatementLine.update({
      where: { id: lineIds[0] },
      data: { matchKind: MULTI, matchId: null, matchItems: picks, note: null },
    });
  }
  const last = lines.reduce((a, b) => (b.date > a.date ? b : a));
  const refs = lines.map((l) => l.ref).sort().join(", ");
  for (const i of items) await setCleared(i.kind, i.id, { date: last.date, ref: refs });
}

/**
 * Everything matched together with a line: the lines sharing its book item
 * (a split) and the items it covers. Undoing any part undoes the whole match,
 * refused if any of the lines sits on a signed-off statement.
 */
async function releaseGroup(line: LineRow) {
  const picks = picksOf(line);
  const lines = line.matchKind && line.matchKind !== NO_ENTRY && line.matchKind !== MULTI
    ? await db.bankStatementLine.findMany({ where: { matchKind: line.matchKind, matchId: line.matchId }, include: { statement: true } })
    : await db.bankStatementLine.findMany({ where: { id: line.id }, include: { statement: true } });
  const signed = lines.find((l) => l.statement.reconciledAt);
  if (signed) {
    throw new Error(`This match includes line ${signed.ref} on the reconciled statement to ${iso(signed.statement.periodTo)}. Reopen that statement first.`);
  }
  await db.bankStatementLine.updateMany({
    where: { id: { in: lines.map((l) => l.id) } },
    data: { matchKind: null, matchId: null, matchItems: Prisma.DbNull, note: null },
  });
  for (const p of picks) await setCleared(p.kind, p.id, null);
}

export async function unmatchLine(lineId: string) {
  const line = await assertEditable(lineId);
  await releaseGroup(line);
}

/**
 * Called before a book entry is voided: if a statement line is paired with it,
 * the pairing is released so the line shows as unmatched again. Refused when
 * that statement has been signed off — a reconciled month must not change
 * under the accountant's feet.
 */
export async function releaseLineFor(kind: MatchKind, itemId: string) {
  const lines = await db.bankStatementLine.findMany({
    where: { OR: [{ matchKind: kind, matchId: itemId }, { matchKind: MULTI }] },
  });
  const line = lines.find((l) => picksOf(l).some((p) => p.kind === kind && p.id === itemId));
  if (line) await releaseGroup(line);
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
  // An item the bank split over several lines is outstanding by whatever had not cleared by then.
  const outstanding = items
    .filter((i) => i.date <= asAt && !(i.voidedOn && i.voidedOn <= asAt))
    .map((i) => ({ ...i, amount: Math.round((i.amount - i.lines.filter((l) => l.date <= asAt).reduce((s, l) => s + l.amount, 0)) * 100) / 100 }))
    .filter((i) => Math.abs(i.amount) >= 0.005);
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
    if (l.matchKind && l.matchKind !== NO_ENTRY) await releaseGroup(l);
  }
  await db.bankStatement.delete({ where: { id: statementId } });
}

// ── Brought-forward items ────────────────────────────────────────────────────

export type BfInput = { date: string; direction: "IN" | "OUT"; amount: string; chequeNo?: string; description: string };

function checkBf(input: BfInput) {
  const amount = new Decimal(input.amount || 0);
  if (amount.lte(0)) throw new Error("Enter the amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter the date it was issued or banked.");
  if (!input.description.trim()) throw new Error("Say who the cheque was to, or what the deposit was.");
  if (input.direction !== "IN" && input.direction !== "OUT") throw new Error("Choose cheque (out) or deposit (in).");
  return {
    date: new Date(input.date), direction: input.direction, amount: amount.toFixed(2),
    chequeNo: input.chequeNo?.trim() || null, description: input.description.trim(),
  };
}

export async function listBfItems(associationId = DEFAULT_ASSOCIATION_ID) {
  const [rows, items] = await Promise.all([
    db.bankBfItem.findMany({ where: { associationId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    bookItems(associationId),
  ]);
  const cleared = new Map(items.filter((i) => i.kind === "bf").map((i) => [i.id, i.line]));
  return rows.map((r) => ({ ...r, amount: Number(r.amount), clearedBy: cleared.get(r.id) ?? null }));
}

export async function createBfItem(input: BfInput, by: string | null, associationId = DEFAULT_ASSOCIATION_ID) {
  return db.bankBfItem.create({ data: { ...checkBf(input), associationId, createdBy: by } });
}

async function assertBfFree(id: string) {
  const item = (await bookItems()).find((i) => i.kind === "bf" && i.id === id);
  if (!item) throw new Error("That brought-forward item no longer exists.");
  if (item.line) throw new Error(`It is matched to statement line ${item.line.ref}. Undo that match first.`);
}

export async function updateBfItem(id: string, input: BfInput) {
  await assertBfFree(id);
  return db.bankBfItem.update({ where: { id }, data: checkBf(input) });
}

export async function deleteBfItem(id: string) {
  await assertBfFree(id);
  await db.bankBfItem.delete({ where: { id } });
}

/** Keyed-but-unposted drafts paid through the bank — they can't be matched until posted. */
export async function bankDrafts(associationId = DEFAULT_ASSOCIATION_ID) {
  const drafts = await db.draft.findMany({ where: { associationId } });
  return drafts
    .filter((d) => ((d.payload as { input?: { method?: string } }).input?.method ?? "BANK") === "BANK")
    .map((d) => ({
      id: d.id, number: d.number, date: d.date, amount: Number(d.amount), party: d.party,
      direction: (d.kind === "receipt" ? "IN" : d.kind === "supplierPayment" ? "OUT" : d.direction) as "IN" | "OUT",
    }));
}

/** Unmatched lines and free book items that could be matched together with a line. */
export async function groupOptions(lineId: string) {
  const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: lineId }, include: { statement: true } });
  const isIn = Number(line.credit) > 0;
  const [others, items] = await Promise.all([
    db.bankStatementLine.findMany({
      where: {
        statementId: line.statementId, matchKind: null, id: { not: line.id },
        ...(isIn ? { credit: { gt: 0 } } : { debit: { gt: 0 } }),
      },
      orderBy: { lineNo: "asc" },
    }),
    bookItems(line.statement.associationId),
  ]);
  const DAY = 86_400_000;
  const near = (d: Date) => Math.abs(d.getTime() - line.date.getTime()) / DAY;
  return {
    lines: others.map((o) => ({
      id: o.id, ref: o.ref, date: iso(o.date), amount: Number(isIn ? o.credit : o.debit),
      label: [o.type, o.serial, o.details.split("\n")[0]].filter(Boolean).join(" · "),
    })),
    items: items
      .filter((i) => !i.line && i.direction === (isIn ? "IN" : "OUT") && (i.kind === "bf" || near(i.date) <= 45))
      .sort((a, b) => near(a.date) - near(b.date))
      .slice(0, 80)
      .map((i) => ({ kind: i.kind, id: i.id, ref: i.ref, label: i.label, date: iso(i.date), amount: i.amount })),
  };
}
