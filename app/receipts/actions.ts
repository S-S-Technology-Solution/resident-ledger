"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { paymentMethodAccount } from "@/lib/control-accounts";
import { prepareEntry } from "@/lib/journal";
import { recordAudit } from "@/lib/audit";
import { postReceipt, type ReceiptInput } from "@/lib/receipt-posting";
import { requirePosting } from "@/lib/permissions";

export type { ReceiptInput } from "@/lib/receipt-posting";

export async function createReceipt(input: ReceiptInput) {
  await requirePosting();
  const result = await postReceipt(input);
  revalidatePath("/receipts");
  revalidatePath(`/residents/${input.residentId}`);
  return result;
}

export async function voidReceipt(id: string, reason: string) {
  await requirePosting();
  const receipt = await db.receipt.findUnique({ where: { id } });
  if (!receipt) throw new Error("Not found");
  if (receipt.voided) throw new Error("Already voided");

  await db.$transaction(async (tx) => {
    if (receipt.entryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: receipt.entryId }, include: { lines: true } });
      if (entry && entry.status === "POSTED") {
        const rev = await prepareEntry(new Date(), "reversal");
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: rev.entryNo,
            batchId: rev.batchId,
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

const chequeReturnSchema = z.object({
  receiptId: z.string().min(1),
  date: z.string().min(1),
  reason: z.string().min(1, "Give a reason — it appears on the resident's ledger"),
  bankCharge: z.string().regex(/^\d*\.?\d{0,2}$/).optional(),
});

/**
 * Cheque return (bounced payment).
 *
 * Reverses the receipt so the invoices it settled fall open again, and optionally
 * posts the bank's returned-cheque fee. Kept separate from a plain void because
 * the reason matters on the resident's ledger, the reversal is dated when the
 * bank returned it rather than today, and a void carries no bank charge.
 */
export async function returnCheque(input: z.infer<typeof chequeReturnSchema>) {
  await requirePosting();
  const data = chequeReturnSchema.parse(input);
  const receipt = await db.receipt.findUnique({ where: { id: data.receiptId } });
  if (!receipt) throw new Error("Receipt not found");
  if (receipt.voided) throw new Error("This receipt has already been reversed");

  const returnDate = new Date(data.date);
  const charge = new Decimal(data.bankCharge || 0);
  const note = `Cheque returned — ${data.reason}`;

  await db.$transaction(async (tx) => {
    if (receipt.entryId) {
      const entry = await tx.journalEntry.findUnique({
        where: { id: receipt.entryId },
        include: { lines: true },
      });
      if (entry && entry.status === "POSTED") {
        const rev = await prepareEntry(returnDate, "reversal");
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: rev.entryNo,
            batchId: rev.batchId,
            date: returnDate,
            description: `${note} (${entry.entryNo})`,
            reference: receipt.receiptNo,
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
        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: note },
        });
      }
    }
    await tx.receipt.update({
      where: { id: data.receiptId },
      data: { voided: true, voidReason: note },
    });
  });

  // The bank's fee is a separate cost to the association, not part of the reversal.
  if (charge.gt(0)) {
    const bankCharges = await db.account.findFirst({
      where: { associationId: DEFAULT_ASSOCIATION_ID, code: { startsWith: "90B1" } },
    });
    if (!bankCharges) {
      throw new Error("Receipt reversed, but no bank charges account (90B1) exists to post the fee to.");
    }
    const bank = await paymentMethodAccount(receipt.method === "CASH" ? "CASH" : "BANK");
    const fee = await prepareEntry(returnDate, "cash");
    await db.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo: fee.entryNo,
        batchId: fee.batchId,
        date: returnDate,
        description: `Returned cheque charge — ${receipt.receiptNo}`,
        reference: receipt.receiptNo,
        status: "POSTED",
        source: "cash",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: bankCharges.id, debit: charge.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: bank.id, debit: "0", credit: charge.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
  }

  await recordAudit("receipt", data.receiptId, "chequeReturn", {
    before: { receiptNo: receipt.receiptNo, amount: receipt.amount.toString() },
    after: { reason: data.reason, bankCharge: charge.toFixed(2) },
  });

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${data.receiptId}`);
  revalidatePath(`/residents/${receipt.residentId}`);
}
