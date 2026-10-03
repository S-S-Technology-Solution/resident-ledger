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
  // The number printed in the Official Receipt Book. Left out, the next number
  // in the receipt sequence is used (e.g. a receipt taken from a bank statement).
  receiptNo: z.string().trim().optional(),
  receivedFrom: z.string().trim().optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}$/, "Pick the first month paid for").optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}$/, "Pick the last month paid for").optional(),
  chequeNo: z.string().trim().optional(),
}).refine((d) => !d.periodFrom || !d.periodTo || d.periodFrom <= d.periodTo, {
  message: "The first month paid for must not be after the last.",
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
  // "A 1004" as written in the book is stored as A1004, like the numbers the system issues.
  const receiptNo = data.receiptNo ? data.receiptNo.replace(/\s+/g, "").toUpperCase() : await nextReceiptNo();
  const clash = await db.receipt.findFirst({ where: { associationId: DEFAULT_ASSOCIATION_ID, receiptNo }, select: { id: true } });
  if (clash) throw new Error(`Receipt ${receiptNo} is already in the system. Check the number in the receipt book.`);

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
        receivedFrom: data.receivedFrom || null,
        periodFrom: data.periodFrom || null,
        periodTo: data.periodTo || null,
        chequeNo: data.chequeNo || null,
        entryId: entry.id,
        allocations: { create: allocations.map((a) => ({ chargeId: a.chargeId, amount: a.amount.toFixed(2) })) },
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: r.id } });
    return r;
  });

  return { id: receipt.id, receiptNo: receipt.receiptNo };
}
