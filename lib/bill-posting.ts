import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount, paymentMethodAccount } from "./control-accounts";
import { prepareEntry } from "./journal";
import { nextNumber, numberInUse } from "./numbering";

const money = z.string().regex(/^\d*\.?\d{0,2}$/, "Enter the amount in ringgit and sen, e.g. 120.50");

/**
 * A supplier payment voucher: one cheque or transfer that settles one or more
 * of the supplier's bills. Posts a single entry — Dr payables, Cr bank or cash —
 * so the bank statement shows one line for the voucher total, and each bill
 * settled gets a payment row carrying the voucher number. Callers check
 * permissions; this only posts.
 */
export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "Pick the supplier"),
  date: z.string().min(1),
  method: z.enum(["CASH", "BANK"]),
  voucherNo: z.string().trim().optional(),
  chequeNo: z.string().trim().optional(),
  bankRef: z.string().trim().optional(),
  paymentFor: z.string().trim().optional(),
  allocations: z.array(z.object({ billId: z.string().min(1), amount: money })).min(1, "Pick at least one bill to pay"),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

export async function postSupplierPayment(input: SupplierPaymentInput, associationId = DEFAULT_ASSOCIATION_ID) {
  const data = supplierPaymentSchema.parse(input);
  const allocations = data.allocations
    .map((a) => ({ billId: a.billId, amount: new Decimal(a.amount || 0) }))
    .filter((a) => a.amount.gt(0));
  if (!allocations.length) throw new Error("Enter the amount paid against at least one bill.");

  const bills = await db.bill.findMany({ where: { id: { in: allocations.map((a) => a.billId) } } });
  const byId = new Map(bills.map((b) => [b.id, b]));
  for (const a of allocations) {
    const bill = byId.get(a.billId);
    if (!bill) throw new Error("A bill on this voucher no longer exists.");
    if (bill.supplierId !== data.supplierId) throw new Error(`Bill ${bill.invoiceNo} belongs to another supplier.`);
    if (bill.status === "VOIDED") throw new Error(`Bill ${bill.invoiceNo} is voided.`);
    const open = new Decimal(bill.amount.toString()).minus(bill.paid.toString());
    if (a.amount.gt(open)) throw new Error(`RM ${a.amount.toFixed(2)} is more than the RM ${open.toFixed(2)} still owing on bill ${bill.invoiceNo}.`);
  }
  const total = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0));

  const date = new Date(data.date);
  let voucherNo = data.voucherNo?.replace(/\s+/g, "").toUpperCase();
  if (voucherNo) {
    if (await numberInUse("CASH_OUT", voucherNo, associationId)) {
      throw new Error(`${voucherNo} is already in the system. Check the number in the voucher book.`);
    }
  } else {
    voucherNo = await nextNumber("CASH_OUT", date, associationId);
  }

  const ap = await controlAccount("AP", associationId);
  const cashOrBank = await paymentMethodAccount(data.method);
  const { entryNo, batchId } = await prepareEntry(date, "billpayment", associationId);
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: data.supplierId } });

  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        associationId,
        entryNo,
        batchId,
        date,
        description: `Payment ${voucherNo} to ${supplier.name}`,
        reference: voucherNo,
        status: "POSTED",
        source: "billpayment",
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ap.id, debit: total.toFixed(2), credit: "0", lineNo: 1 },
            { accountId: cashOrBank.id, debit: "0", credit: total.toFixed(2), lineNo: 2 },
          ],
        },
      },
    });
    for (const a of allocations) {
      const bill = byId.get(a.billId)!;
      await tx.billPayment.create({
        data: {
          billId: bill.id,
          date,
          amount: a.amount.toFixed(2),
          method: data.method,
          bankRef: data.bankRef || null,
          voucherNo,
          chequeNo: data.chequeNo || null,
          paymentFor: data.paymentFor || null,
          entryId: entry.id,
        },
      });
      const paid = new Decimal(bill.paid.toString()).plus(a.amount);
      await tx.bill.update({
        where: { id: bill.id },
        data: { paid: paid.toFixed(2), status: paid.gte(bill.amount.toString()) ? "PAID" : "PARTIAL" },
      });
    }
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: entry.id } });
    return { entryId: entry.id, voucherNo: voucherNo!, total: total.toFixed(2) };
  });
}

/** One bill, one payment — kept for callers that settle a single bill. */
export const paySchema = z.object({
  billId: z.string().min(1),
  date: z.string().min(1),
  amount: z.string(),
  method: z.enum(["CASH", "BANK"]),
  bankRef: z.string().optional(),
  voucherNo: z.string().optional(),
  chequeNo: z.string().optional(),
});

export async function postBillPayment(input: z.infer<typeof paySchema>) {
  const data = paySchema.parse(input);
  const bill = await db.bill.findUnique({ where: { id: data.billId } });
  if (!bill) throw new Error("Bill not found");
  await postSupplierPayment({
    supplierId: bill.supplierId,
    date: data.date,
    method: data.method,
    bankRef: data.bankRef,
    voucherNo: data.voucherNo,
    chequeNo: data.chequeNo,
    allocations: [{ billId: bill.id, amount: data.amount }],
  });
  return bill;
}
