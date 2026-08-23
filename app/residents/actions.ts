"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requirePosting } from "@/lib/permissions";

const schema = z.object({
  id: z.string().optional(),
  unitAddress: z.string().min(1),
  ownerName: z.string().min(1),
  phone: z.string().optional(),
  monthlyFee: z.string().default("0"),
});

export type ResidentInput = z.infer<typeof schema>;

export async function upsertResident(input: ResidentInput) {
  await requirePosting();
  const data = schema.parse(input);
  if (data.id) {
    await db.resident.update({
      where: { id: data.id },
      data: {
        unitAddress: data.unitAddress,
        ownerName: data.ownerName,
        phone: data.phone,
        monthlyFee: data.monthlyFee,
      },
    });
  } else {
    await db.resident.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        unitAddress: data.unitAddress,
        ownerName: data.ownerName,
        phone: data.phone,
        monthlyFee: data.monthlyFee,
      },
    });
  }
  revalidatePath("/residents");
}

export async function toggleResident(id: string, active: boolean) {
  await requirePosting();
  await db.resident.update({ where: { id }, data: { active } });
  revalidatePath("/residents");
}
