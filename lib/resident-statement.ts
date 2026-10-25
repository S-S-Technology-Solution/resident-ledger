import Decimal from "decimal.js";
import { db } from "./db";
import { ageingBucket } from "./ar";

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
