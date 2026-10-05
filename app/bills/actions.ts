"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { controlAccount } from "@/lib/control-accounts";
import { prepareEntry } from "@/lib/journal";
import { requirePosting } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { postBillPayment, postSupplierPayment, supplierPaymentSchema } from "@/lib/bill-posting";
import { postSupplierDebitNote, supplierDebitNoteSchema } from "@/lib/notes";
import { draftsRequired, saveDraft } from "@/lib/drafts";
import { releaseLineFor } from "@/lib/bank-statement/service";
import { attempt } from "@/lib/action-server";

const billSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string().min(1),
  invoiceNo: z.string().min(1),
  date: z.string().min(1),
  dueDate: z.string().optional(),
  amount: z.string(),
  expenseAccountId: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["BILL", "CREDIT_NOTE"]).default("BILL"),
});

export type BillInput = z.infer<typeof billSchema>;

export async function createBill(input: BillInput) {
  return attempt(async () => {
    await requirePosting();
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
          kind: data.kind,
          entryId: entry.id,
        },
      });
      await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: b.id } });
      return b;
    });

    revalidatePath("/bills");
    return { id: bill.id, invoiceNo: bill.invoiceNo };
  });
}

export async function payBill(input: Parameters<typeof postBillPayment>[0]) {
  return attempt(async () => {
    await requirePosting();
    const bill = await postBillPayment(input);
    revalidatePath("/bills");
    revalidatePath(`/bills/${bill.id}`);
  });
}

export async function voidBill(id: string, reason: string) {
  return attempt(async () => {
    await requirePosting();
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
  });
}

/** Voids a whole payment voucher: every bill it settled goes back to owing that amount. */
export async function voidBillPayment(paymentId: string, reason: string) {
  return attempt(async () => {
    await requirePosting();
    if (!reason.trim()) throw new Error("A reason is required to void");
    const payment = await db.billPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Not found");
    const rows = payment.entryId
      ? await db.billPayment.findMany({ where: { entryId: payment.entryId } })
      : [payment];
    await releaseLineFor("billPayment", payment.entryId ?? payment.id);

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
      for (const row of rows) {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: row.billId } });
        const newPaid = new Decimal(bill.paid.toString()).minus(row.amount.toString());
        const newStatus = newPaid.lte(0) ? "UNPAID" : newPaid.gte(bill.amount.toString()) ? "PAID" : "PARTIAL";
        await tx.bill.update({ where: { id: bill.id }, data: { paid: newPaid.toFixed(2), status: newStatus } });
        await tx.billPayment.delete({ where: { id: row.id } });
      }
    });
    await recordAudit("billPayment", payment.entryId ?? payment.id, "void", {
      before: { voucherNo: payment.voucherNo, bills: rows.length, reason },
    });
    revalidatePath("/bills");
    for (const row of rows) revalidatePath(`/bills/${row.billId}`);
  });
}

/** Pays one or more of a supplier's bills with one voucher. */
export async function paySupplier(input: z.infer<typeof supplierPaymentSchema>) {
  return attempt(async () => {
    const user = await requirePosting();
    if (await draftsRequired()) {
      const d = await saveDraft({ kind: "supplierPayment", input }, user.id);
      revalidatePath("/drafts");
      return { draft: true as const, id: d.id, voucherNo: d.number, total: d.amount.toFixed(2) };
    }
    const result = await postSupplierPayment(input);
    revalidatePath("/bills");
    revalidatePath("/bank-statements");
    return { draft: false as const, id: result.entryId, ...result };
  });
}

/** Our debit note to a supplier, reducing what we owe on one bill. */
export async function addSupplierDebitNote(input: z.infer<typeof supplierDebitNoteSchema>) {
  return attempt(async () => {
    await requirePosting();
    const res = await postSupplierDebitNote(input);
    revalidatePath(`/bills/${input.billId}`);
    revalidatePath("/bills");
    return res;
  });
}
