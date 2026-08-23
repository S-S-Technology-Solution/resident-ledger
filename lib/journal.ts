import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { assertPeriodOpen } from "./periods";
import { ensureBatch, groupForSource } from "./batches";
import { nextNumber } from "./numbering";
import Decimal from "decimal.js";

export async function nextEntryNo(
  associationId = DEFAULT_ASSOCIATION_ID,
  date: Date = new Date(),
): Promise<string> {
  return nextNumber("JOURNAL", date, async (stem) => {
    const last = await db.journalEntry.findFirst({
      where: { associationId, entryNo: { startsWith: stem } },
      orderBy: { entryNo: "desc" },
      select: { entryNo: true },
    });
    return last?.entryNo ?? null;
  }, associationId);
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
  const batch = await ensureBatch(groupForSource(source), date, associationId);
  const entryNo = await nextEntryNo(associationId, date);
  return { entryNo, batchId: batch.id };
}

export function linesBalance(lines: { debit: Decimal.Value; credit: Decimal.Value }[]) {
  const d = lines.reduce((a, l) => a.plus(new Decimal(l.debit || 0)), new Decimal(0));
  const c = lines.reduce((a, l) => a.plus(new Decimal(l.credit || 0)), new Decimal(0));
  return { debit: d, credit: c, balanced: d.equals(c) && d.gt(0) };
}
