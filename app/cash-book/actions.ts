"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCashEntry, voidCashEntry } from "@/lib/cash-book";
import { recordAudit } from "@/lib/audit";
import { requirePosting } from "@/lib/permissions";
import { attempt } from "@/lib/action-server";
import { draftsRequired, saveDraft } from "@/lib/drafts";

const money = z.string().regex(/^\d*\.?\d{0,2}$/, "Enter the amount in ringgit and sen, e.g. 120.50");
const schema = z.object({
  direction: z.enum(["IN", "OUT"]),
  date: z.string().min(1),
  description: z.string().min(1, "Describe what this is for"),
  counterparty: z.string().optional(),
  paymentFor: z.string().optional(),
  method: z.enum(["BANK", "CASH"]),
  bankRef: z.string().optional(),
  chequeNo: z.string().optional(),
  refNo: z.string().optional(),
  lines: z.array(z.object({
    accountId: z.string().min(1, "Pick an account on every line"),
    description: z.string().optional(),
    amount: money,
  })).min(1, "Add at least one account line"),
});

export async function createEntry(input: z.infer<typeof schema>) {
  return attempt(async () => {
    const user = await requirePosting();
    const data = schema.parse(input);
    if (await draftsRequired()) {
      const d = await saveDraft({ kind: "cashEntry", input: data }, user.id);
      revalidatePath("/drafts");
      return { draft: true as const, id: d.id, refNo: d.number };
    }
    const entry = await createCashEntry(data);
    revalidatePath("/cash-book");
    revalidatePath("/reports/cash-book");
    revalidatePath("/bank-statements");
    return { draft: false as const, id: entry.id, refNo: entry.refNo };
  });
}

export async function voidEntry(id: string, reason: string) {
  return attempt(async () => {
    await requirePosting();
    if (!reason.trim()) throw new Error("A reason is required to void");
    await voidCashEntry(id, reason);
    await recordAudit("cashEntry", id, "void", { before: { reason } });
    revalidatePath("/cash-book");
    revalidatePath("/reports/cash-book");
    revalidatePath("/bank-statements");
  });
}
