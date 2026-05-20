"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { controlAccount, paymentMethodAccount } from "@/lib/control-accounts";
import { nextEntryNo } from "@/lib/journal";
import { nextReceiptNo } from "@/lib/receipts";
import { residentOutstanding } from "@/lib/ar";

const allocationSchema = z.object({ chargeId: z.string(), amount: z.string() });
const schema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  amount: z.string(),
  method: z.enum(["CASH", "BANK"]),
  bankRef: z.string().optional(),
  allocations: z.array(allocationSchema).default([]),
});

export type ReceiptInput = z.infer<typeof schema>;

export async function createReceipt(input: ReceiptInput) {
  const data = schema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  // FIFO allocate if none provided
  let allocations = data.allocations.map((a) => ({ chargeId: a.chargeId, amount: new Decimal(a.amount) }));
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
  const entryNo = await nextEntryNo();
  const receiptNo = await nextReceiptNo();

  const receipt = await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
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

  revalidatePath("/receipts");
  revalidatePath(`/residents/${data.residentId}`);
  return { id: receipt.id, receiptNo: receipt.receiptNo };
}

export async function voidReceipt(id: string, reason: string) {
  const receipt = await db.receipt.findUnique({ where: { id } });
  if (!receipt) throw new Error("Not found");
  if (receipt.voided) throw new Error("Already voided");

  await db.$transaction(async (tx) => {
    if (receipt.entryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: receipt.entryId }, include: { lines: true } });
      if (entry && entry.status === "POSTED") {
        const reversalNo = await nextEntryNo();
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: reversalNo,
            date: new Date(),
            description: `Reversal of ${entry.entryNo}: ${reason}`,
            status: "POSTED",
            postedAt: new Date(),
            source: "reversal",
            reversesId: entry.id,
            lines: {
              create: entry.lines.map((l, i) => ({
                accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo, lineNo: i + 1,
              })),
            },
          },
        });
        await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
      }
    }
    await tx.receipt.update({ where: { id }, data: { voided: true, voidReason: reason } });
  });
  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath(`/residents/${receipt.residentId}`);
}
