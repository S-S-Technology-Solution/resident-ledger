import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount, paymentMethodAccount } from "./control-accounts";
import { prepareEntry } from "./journal";
import { nextReceiptNo } from "./receipts";
import { residentOutstanding } from "./ar";

/**
 * Posts a resident receipt: Dr bank or cash, Cr residents control, with the
 * amount set against the resident's charges (oldest first unless allocations
 * are given). Callers check permissions; this only posts.
 */
const allocationSchema = z.object({ chargeId: z.string(), amount: z.string() });
export const receiptSchema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  amount: z.string(),
  method: z.enum(["CASH", "BANK"]),
  bankRef: z.string().optional(),
  allocations: z.array(allocationSchema).default([]),
});

export type ReceiptInput = z.infer<typeof receiptSchema>;

export async function postReceipt(input: ReceiptInput) {
  const data = receiptSchema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  // FIFO allocate if none provided
  const allocations = data.allocations.map((a) => ({ chargeId: a.chargeId, amount: new Decimal(a.amount) }));
  if (allocations.length === 0) {
    const open = await residentOutstanding(data.residentId);
    let remaining = amount;
    for (const c of open) {
      if (c.open.lte(0)) continue;
      if (remaining.lte(0)) break;
      const take = Decimal.min(c.open, remaining);
      allocations.push({ chargeId: c.id, amount: take });
      remaining = remaining.minus(take);
    }
  }
  const allocSum = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0));
  if (allocSum.gt(amount)) throw new Error("Allocations exceed receipt amount");

  const ar = await controlAccount("AR");
  const cashOrBank = await paymentMethodAccount(data.method);
  const { entryNo, batchId } = await prepareEntry(new Date(data.date), "receipt");
  const receiptNo = await nextReceiptNo();

  const receipt = await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
        batchId,
        date: new Date(data.date),
        description: `Receipt ${receiptNo}`,
        reference: receiptNo,
        status: "POSTED",
        source: "receipt",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: cashOrBank.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: ar.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    const r = await tx.receipt.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        receiptNo,
        residentId: data.residentId,
        date: new Date(data.date),
        amount: amount.toFixed(2),
        method: data.method,
        bankRef: data.bankRef,
        entryId: entry.id,
        allocations: { create: allocations.map((a) => ({ chargeId: a.chargeId, amount: a.amount.toFixed(2) })) },
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: r.id } });
    return r;
  });

  return { id: receipt.id, receiptNo: receipt.receiptNo };
}
