"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { controlAccount } from "@/lib/control-accounts";
import { nextEntryNo } from "@/lib/journal";

const schema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  amount: z.string(),
  description: z.string().min(1),
});

export type ChargeInput = z.infer<typeof schema>;

async function createChargeWithJE(input: ChargeInput) {
  const data = schema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  const ar = await controlAccount("AR");
  const income = await controlAccount("INCOME_FEE");
  const entryNo = await nextEntryNo();

  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
        date: new Date(data.date),
        description: data.description,
        status: "POSTED",
        source: "charge",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ar.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: income.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    const charge = await tx.charge.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        residentId: data.residentId,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        amount: amount.toFixed(2),
        description: data.description,
        date: new Date(data.date),
        entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: charge.id } });
    return charge;
  });
}

export async function createCharge(input: ChargeInput) {
  const c = await createChargeWithJE(input);
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
  const data = bulkSchema.parse(input);
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
  });
  let created = 0, skipped = 0;
  for (const r of residents) {
    const fee = new Decimal(r.monthlyFee.toString());
    if (fee.lte(0)) { skipped++; continue; }
    const existing = await db.charge.findFirst({
      where: { residentId: r.id, periodMonth: data.periodMonth, periodYear: data.periodYear, voided: false },
    });
    if (existing) { skipped++; continue; }
    await createChargeWithJE({
      residentId: r.id,
      date: data.date,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amount: fee.toFixed(2),
      description: `Monthly fee — ${data.periodYear}-${String(data.periodMonth).padStart(2, "0")}`,
    });
    created++;
  }
  revalidatePath("/charges");
  revalidatePath("/residents");
  return { created, skipped };
}

export async function voidCharge(id: string, reason: string) {
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
        const reversalNo = await nextEntryNo();
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: reversalNo,
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
  revalidatePath("/charges");
  revalidatePath(`/residents/${charge.residentId}`);
}
