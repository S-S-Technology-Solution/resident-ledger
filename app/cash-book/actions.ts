"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCashEntry, voidCashEntry } from "@/lib/cash-book";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  direction: z.enum(["IN", "OUT"]),
  date: z.string().min(1),
  amount: z.string().regex(/^\d*\.?\d{0,2}$/, "Invalid amount"),
  description: z.string().min(1, "Describe what this is for"),
  accountId: z.string().min(1, "Pick an account"),
  counterparty: z.string().optional(),
  method: z.enum(["BANK", "CASH"]),
  bankRef: z.string().optional(),
  chequeNo: z.string().optional(),
});

export async function createEntry(input: z.infer<typeof schema>) {
  const data = schema.parse(input);
  const entry = await createCashEntry(data);
  revalidatePath("/cash-book");
  revalidatePath("/reports/cash-book");
  revalidatePath("/reconciliation");
  return { id: entry.id, refNo: entry.refNo };
}

export async function voidEntry(id: string, reason: string) {
  if (!reason.trim()) throw new Error("A reason is required to void");
  await voidCashEntry(id, reason);
  await recordAudit("cashEntry", id, "void", { before: { reason } });
  revalidatePath("/cash-book");
  revalidatePath("/reports/cash-book");
  revalidatePath("/reconciliation");
}
