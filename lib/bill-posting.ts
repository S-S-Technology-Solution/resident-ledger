import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount, paymentMethodAccount } from "./control-accounts";
import { prepareEntry } from "./journal";

/**
 * Pays a supplier bill: Dr payables control, Cr bank or cash, and moves the
 * bill to partly or fully paid. Callers check permissions; this only posts.
 */
export const paySchema = z.object({
  billId: z.string().min(1),
  date: z.string().min(1),
  amount: z.string(),
  method: z.enum(["CASH", "BANK"]),
  bankRef: z.string().optional(),
});

export async function postBillPayment(input: z.infer<typeof paySchema>) {
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

  return bill;
}
