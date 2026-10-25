import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount } from "./control-accounts";

/**
 * Queries behind the report pages that also download as PDF/Excel. The page and
 * its export both call these, so the two always show the same figures.
 */

const sumLines = (lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[]) =>
  lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())), new Decimal(0));

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

function summarise(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

/** One line of detail for an audit entry: what it looked like before, else after. */
export function auditDetail(e: { before: unknown; after: unknown }) {
  return summarise(e.before) || summarise(e.after) || "—";
}

// ---------------------------------------------------------------------------
// Cash book
// ---------------------------------------------------------------------------

export type CashBookAccount = "BANK" | "CASH";

/** Bank or cash account movements for a period, with payee and voucher no. and a running balance. */
export async function cashBook(r: { from?: string; to?: string; account?: string }) {
  const accountKey: CashBookAccount = r.account === "CASH" ? "CASH" : "BANK";
  const acc = await controlAccount(accountKey);

  // Default period: the current month to date.
  const now = new Date();
  const fromDate = r.from ? new Date(r.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = r.to ? new Date(r.to) : now;
  toDate.setHours(23, 59, 59, 999);

  const [linesBefore, linesInRange] = await Promise.all([
    db.journalLine.findMany({
      where: { accountId: acc.id, entry: { date: { lt: fromDate }, status: { not: "DRAFT" as const } } },
      select: { debit: true, credit: true },
    }),
    db.journalLine.findMany({
      where: { accountId: acc.id, entry: { date: { gte: fromDate, lte: toDate }, status: { not: "DRAFT" as const } } },
      include: { entry: true },
    }),
  ]);

  const opening = sumLines(linesBefore);

  // For each line, resolve payee/counterparty by looking up the source row.
  // Supplier payment vouchers are found by their journal entry (one voucher may pay several bills).
  const billPaymentEntryIds = linesInRange
    .filter((l) => l.entry.source === "billpayment")
    .map((l) => l.entryId);
  const receiptIds = linesInRange
    .filter((l) => l.entry.source === "receipt" && l.entry.sourceId)
    .map((l) => l.entry.sourceId as string);

  const [billPayments, receipts] = await Promise.all([
    billPaymentEntryIds.length
      ? db.billPayment.findMany({
          where: { entryId: { in: billPaymentEntryIds } },
          include: { bill: { include: { supplier: true } } },
        })
      : Promise.resolve([]),
    receiptIds.length
      ? db.receipt.findMany({
          where: { id: { in: receiptIds } },
          include: { resident: true },
        })
      : Promise.resolve([]),
  ]);
  const bpMap = new Map(billPayments.map((p) => [p.entryId, p]));
  const rcMap = new Map(receipts.map((r) => [r.id, r]));

  const sorted = [...linesInRange].sort(
    (a, b) =>
      a.entry.date.getTime() - b.entry.date.getTime() ||
      a.entry.entryNo.localeCompare(b.entry.entryNo),
  );

  let running = opening;
  const rows = sorted.map((l) => {
    const debit = new Decimal(l.debit.toString());
    const credit = new Decimal(l.credit.toString());
    running = running.plus(debit).minus(credit);
    let payee = "—";
    let voucher = l.entry.entryNo;
    if (l.entry.source === "billpayment") {
      const bp = bpMap.get(l.entryId);
      if (bp) {
        payee = bp.bill.supplier.name;
        voucher = bp.voucherNo || bp.bankRef || bp.bill.invoiceNo || l.entry.entryNo;
      }
    } else if (l.entry.source === "receipt" && l.entry.sourceId) {
      const rc = rcMap.get(l.entry.sourceId);
      if (rc) {
        payee = `${rc.resident.unitAddress} — ${rc.resident.ownerName}`;
        voucher = rc.receiptNo;
      }
    }
    return {
      key: l.id,
      date: l.entry.date,
      voucher,
      payee,
      description: l.entry.description,
      debit,
      credit,
      balance: running,
    };
  });

  return {
    accountKey,
    accountLabel: accountKey === "BANK" ? "Bank (3300/0000)" : "Cash (3300/0010)",
    fromDate,
    toDate,
    opening,
    rows,
    totalIn: rows.reduce((s, x) => s.plus(x.debit), new Decimal(0)),
    totalOut: rows.reduce((s, x) => s.plus(x.credit), new Decimal(0)),
    closing: running,
  };
}

// ---------------------------------------------------------------------------
// Cash flow statement
// ---------------------------------------------------------------------------

const CASH_CODES = ["3300/0000", "3300/0010"];

/** Cash in and out for a period, grouped by the account on the other side of each entry. */
export async function cashFlow(r: { from?: string; to?: string }) {
  const fromDate = r.from ? new Date(r.from) : undefined;
  const toDate = r.to ? new Date(r.to) : new Date();

  const cashAccounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, code: { in: CASH_CODES } },
    select: { id: true, code: true, name: true },
  });
  const cashIds = cashAccounts.map((a) => a.id);

  // Every entry that moves cash, paired with whatever sat on the other side.
  const cashLines = await db.journalLine.findMany({
    where: {
      accountId: { in: cashIds },
      entry: {
        associationId: DEFAULT_ASSOCIATION_ID,
        status: { not: "DRAFT" as const },
        date: { ...(fromDate && { gte: fromDate }), lte: toDate },
      },
    },
    include: {
      entry: { include: { lines: { include: { account: true } } } },
    },
  });

  // Opening cash: everything before the window.
  const openingLines = fromDate
    ? await db.journalLine.findMany({
        where: {
          accountId: { in: cashIds },
          entry: { associationId: DEFAULT_ASSOCIATION_ID, status: { not: "DRAFT" as const }, date: { lt: fromDate } },
        },
        select: { debit: true, credit: true },
      })
    : [];
  const opening = sumLines(openingLines);

  // Group the movement by the account on the other side of each cash line.
  const buckets = new Map<string, { code: string; name: string; type: string; inflow: Decimal; outflow: Decimal }>();

  for (const line of cashLines) {
    const net = new Decimal(line.debit.toString()).minus(new Decimal(line.credit.toString()));
    if (net.isZero()) continue;

    const others = line.entry.lines.filter((l) => !cashIds.includes(l.accountId));
    const otherTotal = others.reduce(
      (s, l) => s.plus(new Decimal(l.debit.toString())).plus(new Decimal(l.credit.toString())),
      new Decimal(0),
    );
    if (otherTotal.isZero()) continue;

    for (const o of others) {
      const share = new Decimal(o.debit.toString()).plus(new Decimal(o.credit.toString()));
      if (share.isZero()) continue;
      const portion = net.times(share).dividedBy(otherTotal);
      const key = o.account.code;
      const b = buckets.get(key) ?? {
        code: o.account.code, name: o.account.name, type: o.account.type,
        inflow: new Decimal(0), outflow: new Decimal(0),
      };
      if (portion.gt(0)) b.inflow = b.inflow.plus(portion);
      else b.outflow = b.outflow.plus(portion.abs());
      buckets.set(key, b);
    }
  }

  const rows = [...buckets.values()].sort((a, b) => a.code.localeCompare(b.code));
  const totalIn = rows.reduce((s, x) => s.plus(x.inflow), new Decimal(0));
  const totalOut = rows.reduce((s, x) => s.plus(x.outflow), new Decimal(0));
  const movement = totalIn.minus(totalOut);

  return {
    cashAccounts,
    fromDate,
    toDate,
    opening,
    inflows: rows.filter((x) => x.inflow.gt(x.outflow)),
    outflows: rows.filter((x) => x.outflow.gte(x.inflow)),
    movement,
    closing: opening.plus(movement),
  };
}

// ---------------------------------------------------------------------------
// Check transaction
// ---------------------------------------------------------------------------

export type TransactionSearch = { q?: string; amount?: string; from?: string; to?: string; status?: string };

export const hasTransactionFilter = (s: TransactionSearch) => Boolean(s.q || s.amount || s.from || s.to || s.status);

/** Journal entries matching the enquiry, newest first; none until something is filled in. */
export async function findTransactions(s: TransactionSearch, take?: number) {
  if (!hasTransactionFilter(s)) return [];
  const where: Prisma.JournalEntryWhereInput = { associationId: DEFAULT_ASSOCIATION_ID };
  if (s.status) where.status = s.status as Prisma.EnumJournalStatusFilter["equals"];
  if (s.from || s.to) {
    where.date = { ...(s.from && { gte: new Date(s.from) }), ...(s.to && { lte: new Date(s.to) }) };
  }
  if (s.q) {
    where.OR = [
      { description: { contains: s.q, mode: "insensitive" } },
      { reference: { contains: s.q, mode: "insensitive" } },
      { entryNo: { contains: s.q, mode: "insensitive" } },
    ];
  }
  if (s.amount) {
    // Match either side, so you can search by a figure off a bank statement.
    where.lines = { some: { OR: [{ debit: s.amount }, { credit: s.amount }] } };
  }

  const entries = await db.journalEntry.findMany({
    where,
    include: {
      batch: { select: { batchNo: true } },
      lines: { include: { account: { select: { code: true, name: true } } } },
    },
    orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    take,
  });
  return entries.map((e) => ({
    ...e,
    total: e.lines.reduce((t, l) => t.plus(new Decimal(l.debit.toString())), new Decimal(0)),
  }));
}

// ---------------------------------------------------------------------------
// Remittance advice
// ---------------------------------------------------------------------------

/** What was paid to one supplier in a period, and which invoice each payment settled. */
export async function remittancePayments(supplierId: string, r: { from?: string; to?: string }) {
  const fromDate = r.from ? new Date(r.from) : undefined;
  const toDate = r.to ? new Date(r.to) : undefined;
  const payments = await db.billPayment.findMany({
    where: {
      bill: { supplierId, associationId: DEFAULT_ASSOCIATION_ID }, method: { not: "DEBIT_NOTE" },
      ...(fromDate || toDate
        ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
        : {}),
    },
    include: { bill: true },
    orderBy: { date: "asc" },
  });
  const total = payments.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
  return { payments, total };
}
