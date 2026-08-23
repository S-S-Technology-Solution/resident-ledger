import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Refuses postings into a locked period or a closed financial year.
 *
 * Two separate guards: `lockedThrough` is the soft cut-off the treasurer sets in
 * Settings, and a closed FiscalYear is the hard one set by year-end closing.
 */
export async function assertPeriodOpen(date: Date, associationId = DEFAULT_ASSOCIATION_ID) {
  const assoc = await db.association.findUnique({
    where: { id: associationId },
    select: { lockedThrough: true },
  });

  if (assoc?.lockedThrough && date <= assoc.lockedThrough) {
    throw new Error(
      `Period is locked up to ${fmtDate(assoc.lockedThrough)} — nothing can be posted on or before that date. Change the lock date in Settings if this is intentional.`,
    );
  }

  const fy = await db.fiscalYear.findUnique({
    where: { associationId_year: { associationId, year: date.getFullYear() } },
    select: { year: true, closed: true },
  });

  if (fy?.closed) {
    throw new Error(
      `Financial year ${fy.year} has been closed. Reopen it before posting into that year.`,
    );
  }
}

export async function isPeriodOpen(date: Date, associationId = DEFAULT_ASSOCIATION_ID) {
  try {
    await assertPeriodOpen(date, associationId);
    return true;
  } catch {
    return false;
  }
}
