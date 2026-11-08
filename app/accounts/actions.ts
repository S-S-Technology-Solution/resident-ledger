"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/permissions";
import { reservedAccountCodes } from "@/lib/control-accounts";
import { attempt } from "@/lib/action-server";

const upsertSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().min(1).max(120),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  normalSide: z.enum(["DEBIT", "CREDIT"]),
  group: z.string().min(1).max(60),
  classifiedAs: z.string().max(10).nullable().optional(),
});

export type UpsertAccountInput = z.infer<typeof upsertSchema>;

export async function upsertAccount(input: UpsertAccountInput) {
  return attempt(async () => {
    await requireAdmin();
    const data = upsertSchema.parse(input);
    const details = {
      name: data.name, type: data.type, normalSide: data.normalSide,
      group: data.group, classifiedAs: data.classifiedAs ?? null,
    };
    if (data.id) {
      // The A/C No. is fixed once the account exists; only its details can change.
      const account = await db.account.findUnique({ where: { id: data.id }, select: { code: true } });
      if (!account) throw new Error("Account not found");
      if (account.code !== data.code) throw new Error(`The A/C No. cannot be changed once the account is created. It stays ${account.code}.`);
      await db.account.update({ where: { id: data.id }, data: details });
    } else {
      const taken = await db.account.findUnique({
        where: { associationId_code: { associationId: DEFAULT_ASSOCIATION_ID, code: data.code } },
        select: { name: true },
      });
      if (taken) throw new Error(`A/C No. ${data.code} is already used by ${taken.name}.`);
      await db.account.create({
        data: { associationId: DEFAULT_ASSOCIATION_ID, code: data.code, ...details },
      });
    }
    revalidatePath("/accounts");
  });
}

export async function toggleAccount(id: string, active: boolean) {
  return attempt(async () => {
    await requireAdmin();
    const used = await db.journalLine.count({ where: { accountId: id } });
    if (!active && used > 0) {
      throw new Error("Cannot deactivate an account that has journal entries. Continue using it or rename it.");
    }
    await db.account.update({ where: { id }, data: { active } });
    revalidatePath("/accounts");
  });
}

export async function deleteAccount(id: string) {
  return attempt(async () => {
    await requireAdmin();
    const account = await db.account.findUnique({ where: { id } });
    if (!account) throw new Error("Account not found");

    // Whatever the control accounts currently point at must survive.
    const reserved = await reservedAccountCodes();
    if (reserved.has(account.code)) {
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
  });
}
