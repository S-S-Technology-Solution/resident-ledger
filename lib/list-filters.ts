import type { Prisma } from "@prisma/client";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * The search / date / status filters behind the list screens. The page and its
 * PDF/Excel export both build their query here, so an export always holds the
 * rows the screen shows — all of them, not just the page on screen.
 */
export type ListFilter = { q?: string; from?: string; to?: string; status?: string };

const dateRange = (from?: string, to?: string) =>
  from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

/** Residents list search: address, owner or debtor code. */
export function filterResidents<T extends { unitAddress: string; ownerName: string; debtorCode: string | null }>(all: T[], q?: string) {
  if (!q) return all;
  const s = q.toLowerCase();
  return all.filter((r) => r.unitAddress.toLowerCase().includes(s) || r.ownerName.toLowerCase().includes(s) || r.debtorCode?.toLowerCase().includes(s));
}

export function chargeWhere({ q, from, to }: ListFilter): Prisma.ChargeWhereInput {
  return {
    associationId: DEFAULT_ASSOCIATION_ID,
    ...dateRange(from, to),
    ...(q ? {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { resident: { unitAddress: { contains: q, mode: "insensitive" } } },
        { resident: { ownerName: { contains: q, mode: "insensitive" } } },
      ],
    } : {}),
  };
}
export const CHARGE_ORDER = [{ date: "desc" }, { createdAt: "desc" }] satisfies Prisma.ChargeOrderByWithRelationInput[];

// Credit notes live with the resident's account, not the receipts list.
export function receiptWhere({ q, from, to }: ListFilter): Prisma.ReceiptWhereInput {
  return {
    associationId: DEFAULT_ASSOCIATION_ID,
    method: { not: "CREDIT_NOTE" },
    ...dateRange(from, to),
    ...(q ? {
      OR: [
        { receiptNo: { contains: q, mode: "insensitive" } },
        { bankRef: { contains: q, mode: "insensitive" } },
        { resident: { unitAddress: { contains: q, mode: "insensitive" } } },
        { resident: { ownerName: { contains: q, mode: "insensitive" } } },
      ],
    } : {}),
  };
}
export const RECEIPT_ORDER = [{ date: "desc" }, { receiptNo: "desc" }] satisfies Prisma.ReceiptOrderByWithRelationInput[];

export const BILL_STATUSES = ["UNPAID", "PARTIAL", "PAID", "VOIDED"] as const;

export function billWhere({ status, q, from, to }: ListFilter): Prisma.BillWhereInput {
  return {
    associationId: DEFAULT_ASSOCIATION_ID,
    ...(status ? { status: status as (typeof BILL_STATUSES)[number] } : {}),
    ...dateRange(from, to),
    ...(q ? {
      OR: [
        { invoiceNo: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
      ],
    } : {}),
  };
}
export const BILL_ORDER = [{ date: "desc" }, { createdAt: "desc" }] satisfies Prisma.BillOrderByWithRelationInput[];

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export function accountWhere(type?: string): Prisma.AccountWhereInput {
  return {
    associationId: DEFAULT_ASSOCIATION_ID,
    ...(type ? { type: type as (typeof ACCOUNT_TYPES)[number] } : {}),
  };
}

/** Chart of accounts "A/C Type" column: P&L or Balance Sheet. */
export function acTypeLabel(t: string) {
  return t === "INCOME" || t === "EXPENSE" ? "P&L" : "Balance Sheet";
}

export const CASH_BOOK_ORDER = [{ date: "desc" }, { refNo: "desc" }] satisfies Prisma.CashEntryOrderByWithRelationInput[];

export const JOURNAL_STATUSES = ["DRAFT", "POSTED", "VOIDED"] as const;

export function journalWhere({ q, status, from, to }: ListFilter): Prisma.JournalEntryWhereInput {
  return {
    associationId: DEFAULT_ASSOCIATION_ID,
    ...(status ? { status: status as (typeof JOURNAL_STATUSES)[number] } : {}),
    ...dateRange(from, to),
    ...(q ? {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { entryNo: { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };
}
export const JOURNAL_ORDER = [{ date: "desc" }, { entryNo: "desc" }] satisfies Prisma.JournalEntryOrderByWithRelationInput[];

/** Batches with their posted (non-draft) entries, for the value column. */
export function batchQuery(year?: number) {
  return {
    where: { associationId: DEFAULT_ASSOCIATION_ID, ...(year ? { year } : {}) },
    orderBy: [{ year: "desc" }, { month: "desc" }, { group: "asc" }],
    include: {
      entries: {
        where: { status: { not: "DRAFT" } },
        select: { id: true, lines: { select: { debit: true } } },
      },
    },
  } satisfies Prisma.BatchFindManyArgs;
}
