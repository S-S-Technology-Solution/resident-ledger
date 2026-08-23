import { BatchGroup } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/** Group codes as used in the batch number, matching the accountant's existing setup. */
export const GROUP_CODE: Record<BatchGroup, string> = {
  SALES: "10",
  PURCHASE: "20",
  BANK: "30",
  JOURNAL: "50",
  WAGES: "55",
};

export const GROUP_LABEL: Record<BatchGroup, string> = {
  SALES: "Sales",
  PURCHASE: "Purchases",
  BANK: "Bank",
  JOURNAL: "Journal vouchers",
  WAGES: "Wages",
};

export const BATCH_GROUPS = Object.keys(GROUP_CODE) as BatchGroup[];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Batch no. is YYMM + group code, e.g. Sales for Jan 2026 -> 260110. */
export function batchNoFor(group: BatchGroup, year: number, month: number) {
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${yy}${mm}${GROUP_CODE[group]}`;
}

export function batchDescription(group: BatchGroup, year: number, month: number) {
  return `${GROUP_LABEL[group]} - ${MONTHS[month - 1]} ${year}`;
}

/** Which batch group a posting belongs in, based on what created it. */
export function groupForSource(source: string): BatchGroup {
  switch (source) {
    case "charge":
      return "SALES";
    case "bill":
      return "PURCHASE";
    case "receipt":
    case "billpayment":
    case "cash":
      return "BANK";
    default:
      return "JOURNAL";
  }
}

/**
 * Finds the batch a transaction belongs to, creating it if this is the first
 * entry for that group and month. Million makes you generate batches up front;
 * doing it on demand means a posting can never fail for want of a batch.
 */
export async function ensureBatch(
  group: BatchGroup,
  date: Date,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const existing = await db.batch.findUnique({
    where: { associationId_group_year_month: { associationId, group, year, month } },
  });
  if (existing) {
    if (existing.locked) {
      throw new Error(
        `Batch ${existing.batchNo} (${existing.description}) is locked. Unlock it before posting into that month.`,
      );
    }
    return existing;
  }

  return db.batch.create({
    data: {
      associationId,
      batchNo: batchNoFor(group, year, month),
      group,
      year,
      month,
      description: batchDescription(group, year, month),
    },
  });
}

/** Pre-creates batches across a month range, mirroring Million's Generate Batch. */
export async function generateBatches(
  groups: BatchGroup[],
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  let created = 0;
  for (let y = fromYear; y <= toYear; y++) {
    const start = y === fromYear ? fromMonth : 1;
    const end = y === toYear ? toMonth : 12;
    for (let m = start; m <= end; m++) {
      for (const group of groups) {
        const exists = await db.batch.findUnique({
          where: { associationId_group_year_month: { associationId, group, year: y, month: m } },
          select: { id: true },
        });
        if (exists) continue;
        await db.batch.create({
          data: {
            associationId,
            batchNo: batchNoFor(group, y, m),
            group,
            year: y,
            month: m,
            description: batchDescription(group, y, m),
          },
        });
        created++;
      }
    }
  }
  return created;
}
