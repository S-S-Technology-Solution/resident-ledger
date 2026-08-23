import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { assertPeriodOpen } from "./periods";
import { ensureBatch, groupForSource } from "./batches";
import Decimal from "decimal.js";

export async function nextEntryNo(associationId = DEFAULT_ASSOCIATION_ID): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  const last = await db.journalEntry.findFirst({
    where: { associationId, entryNo: { startsWith: prefix } },
    orderBy: { entryNo: "desc" },
    select: { entryNo: true },
  });
  const n = last ? parseInt(last.entryNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
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
  const entryNo = await nextEntryNo(associationId);
  return { entryNo, batchId: batch.id };
}

export function linesBalance(lines: { debit: Decimal.Value; credit: Decimal.Value }[]) {
  const d = lines.reduce((a, l) => a.plus(new Decimal(l.debit || 0)), new Decimal(0));
  const c = lines.reduce((a, l) => a.plus(new Decimal(l.credit || 0)), new Decimal(0));
  return { debit: d, credit: c, balanced: d.equals(c) && d.gt(0) };
}
