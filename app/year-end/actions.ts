"use server";

import { revalidatePath } from "next/cache";
import { closeYear, reopenYear, previewYearEnd } from "@/lib/year-end";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export async function previewClosing(year: number) {
  return previewYearEnd(year);
}

export async function runYearEndClosing(year: number) {
  const session = await currentSession();
  const user = session
    ? await db.user.findUnique({ where: { id: session.userId }, select: { name: true } })
    : null;
  const result = await closeYear(year, user?.name ?? undefined);
  await recordAudit("fiscalYear", String(year), "close", { after: result });
  revalidatePath("/year-end");
  revalidatePath("/reports/trial-balance");
  revalidatePath("/reports/balance-sheet");
  revalidatePath("/reports/profit-loss");
  return result;
}

export async function undoYearEndClosing(year: number) {
  await reopenYear(year);
  await recordAudit("fiscalYear", String(year), "reopen");
  revalidatePath("/year-end");
  revalidatePath("/reports/trial-balance");
  revalidatePath("/reports/balance-sheet");
  revalidatePath("/reports/profit-loss");
}
