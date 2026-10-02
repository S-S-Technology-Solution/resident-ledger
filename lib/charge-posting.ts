import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount } from "./control-accounts";
import { prepareEntry } from "./journal";
import { nextInvoiceNo } from "./invoices";

/**
 * Raises one charge (sales invoice): Dr residents control, Cr fee income, under
 * the next invoice number. Callers check permissions; this only posts.
 */
export const chargeSchema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  amount: z.string(),
  description: z.string().min(1),
});

export type ChargeInput = z.infer<typeof chargeSchema>;

export async function postCharge(input: ChargeInput) {
  const data = chargeSchema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  const ar = await controlAccount("AR");
  const income = await controlAccount("INCOME_FEE");
  const { entryNo, batchId } = await prepareEntry(new Date(data.date), "charge");
  const invoiceNo = await nextInvoiceNo(DEFAULT_ASSOCIATION_ID, new Date(data.date));

  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
        batchId,
        date: new Date(data.date),
        description: data.description,
        status: "POSTED",
        source: "charge",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ar.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: income.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    const charge = await tx.charge.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        residentId: data.residentId,
        invoiceNo,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        amount: amount.toFixed(2),
        description: data.description,
        date: new Date(data.date),
        entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: charge.id } });
    return charge;
  });
}
