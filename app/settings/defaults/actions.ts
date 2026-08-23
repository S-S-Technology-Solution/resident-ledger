"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { SEQUENCE_KEYS, type SequenceKey } from "@/lib/numbering";

const controlSchema = z.object({
  AR: z.string().min(1),
  INCOME_FEE: z.string().min(1),
  BANK: z.string().min(1),
  CASH: z.string().min(1),
  AP: z.string().min(1),
});

export async function saveControlAccounts(input: z.infer<typeof controlSchema>) {
  await requireAdmin();
  const data = controlSchema.parse(input);

  // Every code must exist and be usable, or posting breaks the moment it is saved.
  const codes = Object.values(data);
  const found = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, code: { in: codes } },
    select: { code: true, active: true },
  });
  const byCode = new Map(found.map((a) => [a.code, a]));
  for (const [role, code] of Object.entries(data)) {
    const account = byCode.get(code);
    if (!account) throw new Error(`${role}: account ${code} is not in the chart of accounts`);
    if (!account.active) throw new Error(`${role}: account ${code} is deactivated`);
  }

  const before = await db.association.findUnique({
    where: { id: DEFAULT_ASSOCIATION_ID },
    select: { ctlAr: true, ctlIncomeFee: true, ctlBank: true, ctlCash: true, ctlAp: true },
  });

  await db.association.update({
    where: { id: DEFAULT_ASSOCIATION_ID },
    data: {
      ctlAr: data.AR,
      ctlIncomeFee: data.INCOME_FEE,
      ctlBank: data.BANK,
      ctlCash: data.CASH,
      ctlAp: data.AP,
    },
  });

  await recordAudit("controlAccounts", DEFAULT_ASSOCIATION_ID, "update", { before, after: data });
  revalidatePath("/settings/defaults");
  revalidatePath("/accounts");
}

const sequenceSchema = z.object({
  rows: z.array(z.object({
    key: z.string().min(1),
    prefix: z.string().max(10),
    padding: z.number().int().min(1).max(8),
    resetMonthly: z.boolean(),
  })),
});

export async function saveSequences(input: z.infer<typeof sequenceSchema>) {
  await requireAdmin();
  const data = sequenceSchema.parse(input);

  for (const row of data.rows) {
    if (!SEQUENCE_KEYS.includes(row.key as SequenceKey)) continue;
    await db.numberSequence.upsert({
      where: { associationId_key: { associationId: DEFAULT_ASSOCIATION_ID, key: row.key } },
      update: { prefix: row.prefix, padding: row.padding, resetMonthly: row.resetMonthly },
      create: {
        associationId: DEFAULT_ASSOCIATION_ID,
        key: row.key,
        prefix: row.prefix,
        padding: row.padding,
        resetMonthly: row.resetMonthly,
      },
    });
  }

  await recordAudit("numbering", DEFAULT_ASSOCIATION_ID, "update", { after: data.rows });
  revalidatePath("/settings/defaults");
}
