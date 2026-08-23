import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * Debtor and creditor ledgers — the subsidiary ledger for one resident or
 * supplier, laid out the way the accountant's ledger print does: every invoice
 * and payment in date order with a running balance.
 */

export type LedgerRow = {
  date: Date;
  ref: string;
  description: string;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
  href?: string;
};

type Range = { from?: Date; to?: Date };

function inRange(d: Date, range: Range) {
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

export async function debtorLedger(residentId: string, range: Range = {}) {
  const resident = await db.resident.findUnique({
    where: { id: residentId },
    include: {
      charges: { where: { voided: false }, orderBy: { date: "asc" } },
      receipts: { where: { voided: false }, orderBy: { date: "asc" } },
    },
  });
  if (!resident) return null;

  type Item = { date: Date; ref: string; description: string; debit: Decimal; credit: Decimal; href?: string };
  const items: Item[] = [
    ...resident.charges.map((c) => ({
      date: c.date,
      ref: c.invoiceNo ?? "—",
      description: c.description,
      debit: new Decimal(c.amount.toString()),
      credit: new Decimal(0),
      href: `/charges/${c.id}`,
    })),
    ...resident.receipts.map((r) => ({
      date: r.date,
      ref: r.receiptNo,
      description: r.isOpeningBalance ? "Balance brought forward (in credit)" : `Receipt — ${r.method}`,
      debit: new Decimal(0),
      credit: new Decimal(r.amount.toString()),
      href: r.isOpeningBalance ? undefined : `/receipts/${r.id}`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.ref.localeCompare(b.ref));

  let opening = new Decimal(0);
  const rows: LedgerRow[] = [];
  let running = new Decimal(0);

  for (const it of items) {
    const delta = it.debit.minus(it.credit);
    if (range.from && it.date < range.from) {
      opening = opening.plus(delta);
      running = opening;
      continue;
    }
    if (!inRange(it.date, range)) continue;
    running = running.plus(delta);
    rows.push({ ...it, balance: running });
  }

  return {
    resident,
    opening,
    rows,
    closing: rows.length ? rows[rows.length - 1].balance : opening,
  };
}

export async function creditorLedger(supplierId: string, range: Range = {}) {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    include: {
      bills: {
        where: { status: { not: "VOIDED" } },
        orderBy: { date: "asc" },
        include: { payments: { orderBy: { date: "asc" } } },
      },
    },
  });
  if (!supplier) return null;

  type Item = { date: Date; ref: string; description: string; debit: Decimal; credit: Decimal; href?: string };
  const items: Item[] = [];
  for (const b of supplier.bills) {
    items.push({
      date: b.date,
      ref: b.invoiceNo,
      description: b.isOpeningBalance ? "Balance brought forward" : "Purchase invoice",
      debit: new Decimal(0),
      credit: new Decimal(b.amount.toString()),
      href: `/bills/${b.id}`,
    });
    for (const p of b.payments) {
      items.push({
        date: p.date,
        ref: p.bankRef ?? b.invoiceNo,
        description: `Payment — ${p.method}`,
        debit: new Decimal(p.amount.toString()),
        credit: new Decimal(0),
        href: `/bills/${b.id}`,
      });
    }
  }
  items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.ref.localeCompare(b.ref));

  // Creditors sit credit-side: a positive balance means we owe them.
  let opening = new Decimal(0);
  let running = new Decimal(0);
  const rows: LedgerRow[] = [];

  for (const it of items) {
    const delta = it.credit.minus(it.debit);
    if (range.from && it.date < range.from) {
      opening = opening.plus(delta);
      running = opening;
      continue;
    }
    if (!inRange(it.date, range)) continue;
    running = running.plus(delta);
    rows.push({ ...it, balance: running });
  }

  return {
    supplier,
    opening,
    rows,
    closing: rows.length ? rows[rows.length - 1].balance : opening,
  };
}

/** 12-month transaction summary — the shape of the accountant's management report. */
export async function twelveMonthSummary(year: number, associationId = DEFAULT_ASSOCIATION_ID) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [charges, receipts, bills, billPayments, cashEntries, accounts] = await Promise.all([
    db.charge.findMany({
      where: { associationId, voided: false, isOpeningBalance: false, date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    db.receipt.findMany({
      where: { associationId, voided: false, isOpeningBalance: false, date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    db.bill.findMany({
      where: { associationId, status: { not: "VOIDED" }, isOpeningBalance: false, date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    db.billPayment.findMany({
      where: { bill: { associationId }, date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    db.cashEntry.findMany({
      where: { associationId, voided: false, date: { gte: from, lte: to } },
      select: { date: true, amount: true, direction: true },
    }),
    db.account.findMany({
      where: { associationId, code: { in: ["3300/0000", "3300/0010"] } },
      select: { id: true },
    }),
  ]);

  const bankIds = accounts.map((a) => a.id);
  const bankLines = await db.journalLine.findMany({
    where: {
      accountId: { in: bankIds },
      entry: { associationId, status: "POSTED", date: { lte: to } },
    },
    select: { debit: true, credit: true, entry: { select: { date: true } } },
  });

  const blank = () => Array.from({ length: 12 }, () => new Decimal(0));
  const sales = blank(), purchases = blank(), receipt = blank(), payment = blank(), expenses = blank();

  const add = (arr: Decimal[], d: Date, v: Decimal | string | number) => {
    arr[d.getUTCMonth()] = arr[d.getUTCMonth()].plus(new Decimal(v.toString()));
  };

  charges.forEach((c) => add(sales, c.date, c.amount.toString()));
  bills.forEach((b) => add(purchases, b.date, b.amount.toString()));
  receipts.forEach((r) => add(receipt, r.date, r.amount.toString()));
  billPayments.forEach((p) => add(payment, p.date, p.amount.toString()));
  cashEntries.forEach((c) => {
    if (c.direction === "IN") add(receipt, c.date, c.amount.toString());
    else { add(payment, c.date, c.amount.toString()); add(expenses, c.date, c.amount.toString()); }
  });
  bills.forEach((b) => add(expenses, b.date, b.amount.toString()));

  // Bank and cash balance is cumulative, so carry it across the months.
  const cashBalance = blank();
  for (let m = 0; m < 12; m++) {
    const cutoff = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59));
    cashBalance[m] = bankLines
      .filter((l) => l.entry.date <= cutoff)
      .reduce(
        (s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())),
        new Decimal(0),
      );
  }

  return { year, sales, purchases, receipt, payment, expenses, cashBalance };
}
