"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  creditorCode: z.string().max(20).optional(),
  contact: z.string().optional(),
  phone: z.string().optional(),
  bankAccount: z.string().optional(),
});

export type SupplierInput = z.infer<typeof schema>;

export async function upsertSupplier(input: SupplierInput) {
  const data = schema.parse(input);
  if (data.id) {
    await db.supplier.update({
      where: { id: data.id },
      data: {
        name: data.name, contact: data.contact, phone: data.phone,
        bankAccount: data.bankAccount, creditorCode: data.creditorCode || null,
      },
    });
  } else {
    await db.supplier.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID, ...data,
        creditorCode: data.creditorCode || null,
      },
    });
  }
  revalidatePath("/suppliers");
}

export async function toggleSupplier(id: string, active: boolean) {
  await db.supplier.update({ where: { id }, data: { active } });
  revalidatePath("/suppliers");
}
