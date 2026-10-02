import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { postChargesBulk } from "./charge-posting";

/**
 * Raises one month's fee for every active resident who has a fee and hasn't
 * been charged for that month yet. Safe to run more than once: residents
 * already charged are skipped, so a repeat run creates nothing.
 */
export async function generateMonthlyFees(
  { periodYear, periodMonth, date }: { periodYear: number; periodMonth: number; date: string },
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const residents = await db.resident.findMany({
    where: { associationId, active: true },
    orderBy: { debtorCode: "asc" },
  });
  const already = new Set(
    (await db.charge.findMany({
      where: { associationId, periodMonth, periodYear, voided: false },
      select: { residentId: true },
    })).map((c) => c.residentId),
  );
  const due = residents.filter((r) => new Decimal(r.monthlyFee.toString()).gt(0) && !already.has(r.id));
  const created = await postChargesBulk(due.map((r) => ({
    residentId: r.id,
    date,
    periodMonth,
    periodYear,
    amount: new Decimal(r.monthlyFee.toString()).toFixed(2),
    description: `Monthly fee — ${periodYear}-${String(periodMonth).padStart(2, "0")}`,
  })), associationId);
  return { created, skipped: residents.length - due.length };
}

/** Year and month as it is now in Malaysia, where the association keeps its books. */
export function currentMalaysiaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { periodYear: year, periodMonth: month, date: `${year}-${String(month).padStart(2, "0")}-01` };
}
