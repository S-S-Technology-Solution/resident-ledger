"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";

const upsertSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  normalSide: z.enum(["DEBIT", "CREDIT"]),
  group: z.string().min(1).max(60),
  classifiedAs: z.string().max(10).nullable().optional(),
});

export type UpsertAccountInput = z.infer<typeof upsertSchema>;

export async function upsertAccount(input: UpsertAccountInput) {
  const data = upsertSchema.parse(input);
  const payload = {
    name: data.name, code: data.code, type: data.type, normalSide: data.normalSide,
    group: data.group, classifiedAs: data.classifiedAs ?? null,
  };
  if (data.id) {
    await db.account.update({ where: { id: data.id }, data: payload });
  } else {
    await db.account.create({
      data: { associationId: DEFAULT_ASSOCIATION_ID, ...payload },
    });
  }
  revalidatePath("/accounts");
}

export async function toggleAccount(id: string, active: boolean) {
  const used = await db.journalLine.count({ where: { accountId: id } });
  if (!active && used > 0) {
    throw new Error("Cannot deactivate an account that has journal entries. Continue using it or rename it.");
  }
  await db.account.update({ where: { id }, data: { active } });
  revalidatePath("/accounts");
}
