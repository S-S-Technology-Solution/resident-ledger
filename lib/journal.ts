import { DEFAULT_ASSOCIATION_ID } from "./association";
import { assertPeriodOpen } from "./periods";
import { ensureBatch, groupForSource } from "./batches";
import { nextNumber } from "./numbering";
import Decimal from "decimal.js";

export async function nextEntryNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
  key: "JOURNAL" | "SALES_JOURNAL" = "JOURNAL",
): Promise<string> {
  return nextNumber(key, date, associationId);
}

/**
 * Everything a new journal entry needs before it can be written: checks the
 * period is open, reserves an entry number, and files it in the right monthly
 * batch. Every posting path goes through here so none of them can skip a check.
 */
export async function prepareEntry(
  date: Date,
  source: string,
  associationId = DEFAULT_ASSOCIATION_ID,
): Promise<{ entryNo: string; batchId: string }> {
  await assertPeriodOpen(date, associationId);
  const group = groupForSource(source);
  const batch = await ensureBatch(group, date, associationId);
  // Sales postings (fees, debit and credit notes) are numbered in their own
  // sales journal, SJ-2026-00001, apart from the general journal's JE- numbers.
  const entryNo = await nextEntryNo(associationId, date, group === "SALES" ? "SALES_JOURNAL" : "JOURNAL");
  return { entryNo, batchId: batch.id };
}

export function linesBalance(lines: { debit: Decimal.Value; credit: Decimal.Value }[]) {
  const d = lines.reduce((a, l) => a.plus(new Decimal(l.debit || 0)), new Decimal(0));
  const c = lines.reduce((a, l) => a.plus(new Decimal(l.credit || 0)), new Decimal(0));
  return { debit: d, credit: c, balanced: d.equals(c) && d.gt(0) };
}
