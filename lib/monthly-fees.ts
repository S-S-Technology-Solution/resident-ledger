import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { postChargesBulk } from "./charge-posting";

const FEE_PERIOD = /^Monthly fee — (\d{4})-(\d{2})$/;

/** How a month's fee is described on each owner's bill: "Monthly fee — 2026-01". */
export function monthlyFeeDescription(year: number, month: number) {
  return `Monthly fee — ${year}-${String(month).padStart(2, "0")}`;
}

/** The month a bill described as above is for, as "Jan"; null for any other description. */
export function monthlyFeeMonth(description: string) {
  const m = description.match(FEE_PERIOD);
  return m ? format(new Date(Number(m[1]), Number(m[2]) - 1, 1), "MMM") : null;
}

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
      where: { associationId, periodMonth, periodYear, voided: false, kind: "FEE" },
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
    description: monthlyFeeDescription(periodYear, periodMonth),
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
