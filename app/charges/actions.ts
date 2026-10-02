"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { prepareEntry } from "@/lib/journal";
import { recordAudit } from "@/lib/audit";
import { requirePosting } from "@/lib/permissions";
import { postCharge, postChargesBulk, type ChargeInput } from "@/lib/charge-posting";

export type { ChargeInput } from "@/lib/charge-posting";

export async function createCharge(input: ChargeInput) {
  await requirePosting();
  const c = await postCharge(input);
  revalidatePath("/charges");
  revalidatePath(`/residents/${input.residentId}`);
  return { id: c.id };
}

const bulkSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  date: z.string().min(1),
});

export async function bulkGenerate(input: z.infer<typeof bulkSchema>) {
  await requirePosting();
  const data = bulkSchema.parse(input);
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
    orderBy: { debtorCode: "asc" },
  });
  const already = new Set(
    (await db.charge.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, periodMonth: data.periodMonth, periodYear: data.periodYear, voided: false },
      select: { residentId: true },
    })).map((c) => c.residentId),
  );
  const due = residents.filter((r) => new Decimal(r.monthlyFee.toString()).gt(0) && !already.has(r.id));
  const skipped = residents.length - due.length;
  const created = await postChargesBulk(due.map((r) => ({
    residentId: r.id,
    date: data.date,
    periodMonth: data.periodMonth,
    periodYear: data.periodYear,
    amount: new Decimal(r.monthlyFee.toString()).toFixed(2),
    description: `Monthly fee — ${data.periodYear}-${String(data.periodMonth).padStart(2, "0")}`,
  })));
  revalidatePath("/charges");
  revalidatePath("/residents");
  return { created, skipped };
}

export async function voidCharge(id: string, reason: string) {
  await requirePosting();
  const charge = await db.charge.findUnique({
    where: { id },
    include: { allocations: { include: { receipt: true } } },
  });
  if (!charge) throw new Error("Not found");
  if (charge.voided) throw new Error("Already voided");
  const allocated = charge.allocations
    .filter((a) => !a.receipt.voided)
    .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
  if (allocated.gt(0)) throw new Error("This charge has payments allocated. Void the receipt(s) first.");

  await db.$transaction(async (tx) => {
    if (charge.entryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: charge.entryId }, include: { lines: true } });
      if (entry && entry.status === "POSTED") {
        const rev = await prepareEntry(new Date(), "reversal");
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: rev.entryNo,
            batchId: rev.batchId,
            date: new Date(),
            description: `Reversal of ${entry.entryNo}: ${reason}`,
            status: "POSTED",
            postedAt: new Date(),
            source: "reversal",
            reversesId: entry.id,
            lines: {
              create: entry.lines.map((l, i) => ({
                accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo, lineNo: i + 1,
              })),
            },
          },
        });
        await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
      }
    }
    await tx.charge.update({ where: { id }, data: { voided: true } });
  });
  await recordAudit("charge", id, "void", { before: { invoiceNo: charge.invoiceNo, amount: charge.amount.toString(), reason } });
  revalidatePath("/charges");
  revalidatePath(`/residents/${charge.residentId}`);
}
