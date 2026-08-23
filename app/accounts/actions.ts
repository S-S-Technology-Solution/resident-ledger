"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/permissions";

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
  await requireAdmin();
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
  await requireAdmin();
  const used = await db.journalLine.count({ where: { accountId: id } });
  if (!active && used > 0) {
    throw new Error("Cannot deactivate an account that has journal entries. Continue using it or rename it.");
  }
  await db.account.update({ where: { id }, data: { active } });
  revalidatePath("/accounts");
}

// Control account codes required by the system — never deletable.
const RESERVED_CODES = new Set(["3000/0000", "5000/0001", "3300/0000", "3300/0010", "4000/0000"]);

export async function deleteAccount(id: string) {
  await requireAdmin();
  const account = await db.account.findUnique({ where: { id } });
  if (!account) throw new Error("Account not found");

  if (RESERVED_CODES.has(account.code)) {
    throw new Error(`${account.code} is a system control account and cannot be deleted.`);
  }

  const [lineCount, childCount, billCount] = await Promise.all([
    db.journalLine.count({ where: { accountId: id } }),
    db.account.count({ where: { parentId: id } }),
    db.bill.count({ where: { expenseAccountId: id } }),
  ]);

  if (lineCount > 0) {
    throw new Error(`Cannot delete — account has ${lineCount} journal line${lineCount === 1 ? "" : "s"}. Deactivate it instead to hide it from pickers.`);
  }
  if (childCount > 0) {
    throw new Error(`Cannot delete — ${childCount} other account${childCount === 1 ? " is" : "s are"} grouped under this one. Reassign them first.`);
  }
  if (billCount > 0) {
    throw new Error(`Cannot delete — ${billCount} bill${billCount === 1 ? "" : "s"} reference this account as the expense category.`);
  }

  await db.account.delete({ where: { id } });
  await recordAudit("account", id, "delete", { before: { code: account.code, name: account.name } });
  revalidatePath("/accounts");
}
