"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BatchGroup } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { generateBatches } from "@/lib/batches";

const schema = z.object({
  groups: z.array(z.enum(["SALES", "PURCHASE", "BANK", "JOURNAL", "WAGES"])).min(1),
  fromYear: z.number().int().min(2000).max(2100),
  fromMonth: z.number().int().min(1).max(12),
  toYear: z.number().int().min(2000).max(2100),
  toMonth: z.number().int().min(1).max(12),
});

export async function generate(input: z.infer<typeof schema>) {
  const d = schema.parse(input);
  if (d.toYear * 12 + d.toMonth < d.fromYear * 12 + d.fromMonth) {
    throw new Error("The end month falls before the start month");
  }
  const created = await generateBatches(
    d.groups as BatchGroup[],
    d.fromYear, d.fromMonth, d.toYear, d.toMonth,
  );
  revalidatePath("/batches");
  return { created };
}

export async function setBatchLocked(id: string, locked: boolean) {
  await db.batch.update({ where: { id }, data: { locked } });
  revalidatePath("/batches");
}

export async function deleteBatch(id: string) {
  const count = await db.journalEntry.count({ where: { batchId: id } });
  if (count > 0) {
    throw new Error(
      `This batch holds ${count} ${count === 1 ? "entry" : "entries"} and cannot be deleted. Lock it instead.`,
    );
  }
  await db.batch.delete({ where: { id, associationId: DEFAULT_ASSOCIATION_ID } });
  revalidatePath("/batches");
}
