"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import {
  saveGLOpening,
  saveDebtorOpening,
  saveCreditorOpening,
  type GLOpeningRow,
  type DebtorOpeningRow,
  type CreditorOpeningRow,
} from "@/lib/opening-balances";

const money = z.string().regex(/^-?\d*\.?\d{0,2}$/, "Invalid amount");

const glSchema = z.object({
  date: z.string().min(1),
  rows: z.array(z.object({
    accountId: z.string().min(1),
    debit: money,
    credit: money,
  })),
});

export async function saveGLOpeningBalances(input: z.infer<typeof glSchema>) {
  const data = glSchema.parse(input);
  const result = await saveGLOpening(data.rows as GLOpeningRow[], new Date(data.date));
  await recordAudit("openingBalance", "gl", "save", { after: result });
  revalidatePath("/opening-balances");
  revalidatePath("/reports/trial-balance");
  revalidatePath("/reports/balance-sheet");
  return result;
}

const debtorSchema = z.object({
  rows: z.array(z.object({ residentId: z.string().min(1), amount: money })),
});

export async function saveDebtorOpeningBalances(input: z.infer<typeof debtorSchema>) {
  const data = debtorSchema.parse(input);
  const result = await saveDebtorOpening(data.rows as DebtorOpeningRow[]);
  await recordAudit("openingBalance", "debtors", "save", { after: result });
  revalidatePath("/opening-balances");
  revalidatePath("/residents");
  revalidatePath("/reports/ar-ageing");
  return result;
}

const creditorSchema = z.object({
  rows: z.array(z.object({ supplierId: z.string().min(1), amount: money })),
});

export async function saveCreditorOpeningBalances(input: z.infer<typeof creditorSchema>) {
  const data = creditorSchema.parse(input);
  const result = await saveCreditorOpening(data.rows as CreditorOpeningRow[]);
  await recordAudit("openingBalance", "creditors", "save", { after: result });
  revalidatePath("/opening-balances");
  revalidatePath("/suppliers");
  revalidatePath("/reports/ap-ageing");
  return result;
}
