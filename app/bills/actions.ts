"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { controlAccount, paymentMethodAccount } from "@/lib/control-accounts";
import { prepareEntry } from "@/lib/journal";

const billSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string().min(1),
  invoiceNo: z.string().min(1),
  date: z.string().min(1),
  dueDate: z.string().optional(),
  amount: z.string(),
  expenseAccountId: z.string().min(1),
  description: z.string().optional(),
});

export type BillInput = z.infer<typeof billSchema>;

export async function createBill(input: BillInput) {
  const data = billSchema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  const ap = await controlAccount("AP");
  const expense = await db.account.findUnique({ where: { id: data.expenseAccountId } });
  if (!expense) throw new Error("Expense account not found");

  const { entryNo, batchId } = await prepareEntry(new Date(data.date), "bill");
  const bill = await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
        batchId,
        date: new Date(data.date),
        description: data.description || `Bill ${data.invoiceNo}`,
        reference: data.invoiceNo,
        status: "POSTED",
        source: "bill",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: expense.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: ap.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    const b = await tx.bill.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        supplierId: data.supplierId,
        invoiceNo: data.invoiceNo,
        date: new Date(data.date),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        amount: amount.toFixed(2),
        expenseAccountId: expense.id,
        status: "UNPAID",
        entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: b.id } });
    return b;
  });

  revalidatePath("/bills");
  return { id: bill.id, invoiceNo: bill.invoiceNo };
}

const paySchema = z.object({
  billId: z.string().min(1),
  date: z.string().min(1),
  amount: z.string(),
  method: z.enum(["CASH", "BANK"]),
  bankRef: z.string().optional(),
});

export async function payBill(input: z.infer<typeof paySchema>) {
  const data = paySchema.parse(input);
  const amount = new Decimal(data.amount);
  if (amount.lte(0)) throw new Error("Amount must be positive");

  const bill = await db.bill.findUnique({ where: { id: data.billId } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status === "VOIDED") throw new Error("Bill is voided");
  const billAmount = new Decimal(bill.amount.toString());
  const alreadyPaid = new Decimal(bill.paid.toString());
  const open = billAmount.minus(alreadyPaid);
  if (amount.gt(open)) throw new Error(`Payment exceeds open balance (${open.toFixed(2)})`);

  const ap = await controlAccount("AP");
  const cashOrBank = await paymentMethodAccount(data.method);
  const { entryNo, batchId } = await prepareEntry(new Date(data.date), "billpayment");
  const newPaid = alreadyPaid.plus(amount);
  const newStatus = newPaid.gte(billAmount) ? "PAID" : "PARTIAL";

  await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        entryNo,
        batchId,
        date: new Date(data.date),
        description: `Payment for ${bill.invoiceNo}`,
        reference: data.bankRef ?? bill.invoiceNo,
        status: "POSTED",
        source: "billpayment",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ap.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: cashOrBank.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    const payment = await tx.billPayment.create({
      data: {
        billId: bill.id,
        date: new Date(data.date),
        amount: amount.toFixed(2),
        method: data.method,
        bankRef: data.bankRef,
        entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: payment.id } });
    await tx.bill.update({ where: { id: bill.id }, data: { paid: newPaid.toFixed(2), status: newStatus } });
  });

  revalidatePath("/bills");
  revalidatePath(`/bills/${bill.id}`);
}

export async function voidBill(id: string, reason: string) {
  const bill = await db.bill.findUnique({ where: { id }, include: { payments: true } });
  if (!bill) throw new Error("Not found");
  if (bill.status === "VOIDED") throw new Error("Already voided");
  if (bill.payments.length > 0) throw new Error("This bill has payments. Void the payment(s) first.");
  await db.$transaction(async (tx) => {
    if (bill.entryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: bill.entryId }, include: { lines: true } });
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
    await tx.bill.update({ where: { id }, data: { status: "VOIDED" } });
  });
  revalidatePath("/bills");
}

export async function voidBillPayment(paymentId: string, reason: string) {
  const payment = await db.billPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Not found");
  const bill = await db.bill.findUnique({ where: { id: payment.billId } });
  if (!bill) throw new Error("Bill missing");

  await db.$transaction(async (tx) => {
    if (payment.entryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: payment.entryId }, include: { lines: true } });
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
    const newPaid = new Decimal(bill.paid.toString()).minus(new Decimal(payment.amount.toString()));
    const billAmount = new Decimal(bill.amount.toString());
    const newStatus = newPaid.lte(0) ? "UNPAID" : newPaid.gte(billAmount) ? "PAID" : "PARTIAL";
    await tx.bill.update({ where: { id: bill.id }, data: { paid: newPaid.toFixed(2), status: newStatus } });
    await tx.billPayment.delete({ where: { id: paymentId } });
  });
  revalidatePath("/bills");
  revalidatePath(`/bills/${bill.id}`);
}
