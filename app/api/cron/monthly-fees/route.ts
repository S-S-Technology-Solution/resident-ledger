import { NextResponse } from "next/server";
import { generateMonthlyFees, currentMalaysiaMonth } from "@/lib/monthly-fees";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Raises the current month's fees. Vercel Cron calls this daily (vercel.json)
 * with `Authorization: Bearer $CRON_SECRET`; on the 1st it bills everyone, and
 * on any later day it only picks up residents a missed run left out, so an
 * outage on the 1st costs nothing. Refuses every request without the secret.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = currentMalaysiaMonth();
  try {
    const result = await generateMonthlyFees(period);
    if (result.created > 0) {
      await recordAudit("charges", `${period.periodYear}-${period.periodMonth}`, "autoGenerate", { after: { ...period, ...result } });
    }
    return NextResponse.json({ ...period, ...result });
  } catch (e) {
    // e.g. the month is locked: report it in the cron log rather than crash.
    console.error("monthly-fees cron failed", e);
    return NextResponse.json({ ...period, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
