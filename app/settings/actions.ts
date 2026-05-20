"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";

const schema = z.object({
  name: z.string().min(1),
  registrationNo: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().min(1),
  fiscalYearStart: z.number().int().min(1).max(12),
  lockedThrough: z.string().optional(),
});

export type SettingsInput = z.infer<typeof schema>;

export async function saveSettings(input: SettingsInput) {
  const data = schema.parse(input);
  await db.association.update({
    where: { id: DEFAULT_ASSOCIATION_ID },
    data: {
      name: data.name,
      registrationNo: data.registrationNo || null,
      address: data.address || null,
      currency: data.currency,
      fiscalYearStart: data.fiscalYearStart,
      lockedThrough: data.lockedThrough ? new Date(data.lockedThrough) : null,
    },
  });
  revalidatePath("/", "layout");
}
