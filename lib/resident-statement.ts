import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "./db";
import { getAssociation } from "./association";
import { ageingBucket } from "./ar";
import { ringgitInWords } from "./receipts";

/**
 * A resident's statement of account for a period: balance brought forward,
 * charges and payments with a running balance, the closing balance and an
 * ageing summary as at the end date. Shared by the statement page and its
 * PDF/Excel export. The period defaults to the start of this month to today.
 */
export type StatementRow = {
  date: Date;
  refNo: string;
  description: string;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
};

export async function residentStatement(id: string, { from, to }: { from?: string; to?: string }) {
  const resident = await db.resident.findUnique({ where: { id } });
  if (!resident) return null;

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : now;
  toDate.setHours(23, 59, 59, 999);

  const [allCharges, allReceipts] = await Promise.all([
    db.charge.findMany({
      where: { residentId: id, voided: false, date: { lte: toDate } },
      orderBy: { date: "asc" },
      include: { allocations: { include: { receipt: true } } },
    }),
    db.receipt.findMany({
      where: { residentId: id, voided: false, date: { lte: toDate } },
      orderBy: { date: "asc" },
      include: { allocations: true },
    }),
  ]);

  // Opening balance: net of all activity strictly before fromDate
  const openingFromCharges = allCharges
    .filter((c) => c.date < fromDate)
    .reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0));
  const openingFromReceipts = allReceipts
    .filter((r) => r.date < fromDate)
    .reduce((s, r) => s.plus(new Decimal(r.amount.toString())), new Decimal(0));
  const opening = openingFromCharges.minus(openingFromReceipts);

  const inRange = [
    ...allCharges.filter((c) => c.date >= fromDate).map((c) => ({
      date: c.date,
      refNo: c.invoiceNo ?? "—",
      description: c.description,
      debit: new Decimal(c.amount.toString()),
      credit: new Decimal(0),
    })),
    ...allReceipts.filter((r) => r.date >= fromDate).map((r) => ({
      date: r.date,
      refNo: r.receiptNo,
      description: `Payment received (${r.method === "BANK" ? "Bank Transfer" : "Cash"}${r.bankRef ? ` · ${r.bankRef}` : ""})`,
      debit: new Decimal(0),
      credit: new Decimal(r.amount.toString()),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.debit.gt(0) ? -1 : 1));

  let running = opening;
  const rows: StatementRow[] = inRange.map((r) => {
    running = running.plus(r.debit).minus(r.credit);
    return { ...r, balance: running };
  });
  const closing = running;

  // Ageing as of toDate — same approach as the AR ageing report.
  const ageing = { current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0), d61_90: new Decimal(0), d90p: new Decimal(0) };
  for (const c of allCharges) {
    const amt = new Decimal(c.amount.toString());
    const allocated = c.allocations
      .filter((a) => !a.receipt.voided && a.receipt.date <= toDate)
      .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
    const open = amt.minus(allocated);
    if (open.lte(0)) continue;
    const bucket = ageingBucket(c.date, toDate);
    ageing[bucket] = ageing[bucket].plus(open);
  }
  for (const r of allReceipts) {
    const total = new Decimal(r.amount.toString());
    const applied = r.allocations.reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
    const unapplied = total.minus(applied);
    if (unapplied.gt(0)) ageing.current = ageing.current.minus(unapplied);
  }
  const ageingTotal = ageing.current.plus(ageing.d1_30).plus(ageing.d31_60).plus(ageing.d61_90).plus(ageing.d90p);

  return { resident, fromDate, toDate, opening, rows, closing, ageing, ageingTotal };
}

export type StatementAsAtRow = {
  date: Date;
  refNo: string;
  description: string;
  /** Second line under the description: the bank reference, cheque or method. */
  detail: string | null;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
  /** The posting behind the line. Opening balances have none. */
  entryId: string | null;
};

export type StatementAsAt = NonNullable<Awaited<ReturnType<typeof statementAsAt>>>;

/** Second line for a payment on the statement. */
function paymentDetail(r: { method: string; bankRef: string | null; chequeNo: string | null; receivedFrom: string | null }) {
  if (r.method === "CREDIT_NOTE") return r.receivedFrom;
  // As written on the receipt, e.g. "HLB 408032".
  const ref = r.chequeNo?.trim() || r.bankRef?.trim();
  if (ref) return ref;
  return r.method === "CASH" ? "Cash" : "Bank transfer";
}

/**
 * The statement of account as at one date, laid out like the accountant's
 * print: everything on the resident's account up to that date with a running
 * balance, then what is still owed by the month it was charged, in six columns
 * ending with the statement month. The columns always add up to the balance.
 */
export async function statementAsAt(id: string, to?: string) {
  const [resident, association] = await Promise.all([db.resident.findUnique({ where: { id } }), getAssociation()]);
  if (!resident) return null;

  const day = to ?? new Date().toISOString().slice(0, 10);
  const asAt = new Date(`${day}T23:59:59.999Z`);
  const [year, month, dayOfMonth] = day.split("-").map(Number);

  const [charges, receipts] = await Promise.all([
    db.charge.findMany({
      where: { residentId: id, voided: false, date: { lte: asAt } },
      orderBy: { date: "asc" },
      include: { allocations: { select: { amount: true, receipt: { select: { voided: true, date: true } } } } },
    }),
    db.receipt.findMany({
      where: { residentId: id, voided: false, date: { lte: asAt } },
      orderBy: { date: "asc" },
      include: { allocations: { select: { amount: true, charge: { select: { voided: true, date: true } } } } },
    }),
  ]);

  const items = [
    ...charges.map((c) => ({
      date: c.date,
      refNo: c.invoiceNo ?? "—",
      description: c.description,
      detail: null,
      debit: new Decimal(c.amount.toString()),
      credit: new Decimal(0),
      entryId: c.entryId,
    })),
    ...receipts.map((r) => ({
      date: r.date,
      refNo: r.receiptNo,
      description: r.isOpeningBalance ? "Balance brought forward (in credit)" : r.method === "CREDIT_NOTE" ? "Credit note" : "Payment received",
      detail: r.isOpeningBalance ? null : paymentDetail(r),
      debit: new Decimal(0),
      credit: new Decimal(r.amount.toString()),
      entryId: r.entryId,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.debit.gt(0) ? -1 : 1));

  let balance = new Decimal(0);
  const rows: StatementAsAtRow[] = items.map((it) => {
    balance = balance.plus(it.debit).minus(it.credit);
    return { ...it, balance };
  });

  // The statement month and the four before it; anything older goes in the first column.
  const months = [4, 3, 2, 1, 0].map((back) => new Date(year, month - 1 - back, 1));
  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const columnOf = (charged: Date) =>
    Math.max(0, charged.getUTCFullYear() * 12 + charged.getUTCMonth() - monthKey(months[0]) + 1);
  const owed = Array.from({ length: 6 }, () => new Decimal(0));

  for (const c of charges) {
    const paid = c.allocations
      .filter((a) => !a.receipt.voided && a.receipt.date <= asAt)
      .reduce((s, a) => s.plus(a.amount.toString()), new Decimal(0));
    const column = columnOf(c.date);
    owed[column] = owed[column].plus(c.amount.toString()).minus(paid);
  }
  // Money not yet set against a charge (paid in advance) comes off the latest month.
  for (const r of receipts) {
    const applied = r.allocations
      .filter((a) => !a.charge.voided && a.charge.date <= asAt)
      .reduce((s, a) => s.plus(a.amount.toString()), new Decimal(0));
    owed[5] = owed[5].minus(r.amount.toString()).plus(applied);
  }

  const label = (d: Date) => format(d, "MMM yyyy").toUpperCase();
  const ageing = [
    { label: `> ${label(new Date(year, month - 6, 1))}`, amount: owed[0] },
    ...months.map((d, i) => ({ label: label(d), amount: owed[i + 1] })),
  ];

  return {
    association: { name: association.name, registrationNo: association.registrationNo, address: association.address, currency: association.currency },
    resident: { code: resident.debtorCode, name: resident.ownerName, unit: resident.unitAddress },
    asAt: day,
    month: format(new Date(year, month - 1, 1), "MMMM yyyy"),
    date: format(new Date(year, month - 1, dayOfMonth), "dd/MM/yyyy"),
    rows,
    closing: balance,
    words: balance.isZero() ? "" : `${ringgitInWords(balance.abs().toNumber())}${balance.lt(0) ? " (CREDIT)" : ""}`,
    ageing,
  };
}
