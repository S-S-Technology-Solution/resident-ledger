import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount, paymentMethodAccount } from "./control-accounts";
import { prepareEntry } from "./journal";
import { nextNumber, numberInUse } from "./numbering";
import { residentOutstanding } from "./ar";

/**
 * Debit notes, credit notes and refunds — the adjustments the old system
 * offered on debtor and creditor accounts. Each is stored as the document type
 * whose effect it has, so balances, statements and ageing include it without
 * special handling:
 *
 *   resident debit note   a charge (kind DEBIT_NOTE)   Dr residents  Cr chosen account
 *   resident credit note  a receipt (CREDIT_NOTE)      Dr chosen     Cr residents, set against charges
 *   resident refund       a charge (kind REFUND)       Dr residents  Cr bank/cash, by voucher
 *   supplier debit note   a bill payment (DEBIT_NOTE)  Dr payables   Cr chosen account
 *   supplier credit note  a bill (kind CREDIT_NOTE)    — entered on the bill form
 *
 * Callers check permissions; these only post.
 */

const money = z.string().regex(/^\d*\.?\d{0,2}$/, "Enter the amount in ringgit and sen, e.g. 120.50");
const positive = (v: string) => {
  const d = new Decimal(v || 0);
  if (d.lte(0)) throw new Error("The amount must be greater than zero.");
  return d;
};

async function journal(
  date: Date, source: string, description: string, reference: string,
  debitAccountId: string, creditAccountId: string, amount: Decimal, associationId: string,
) {
  const { entryNo, batchId } = await prepareEntry(date, source, associationId);
  return {
    associationId, entryNo, batchId, date, description, reference,
    status: "POSTED" as const, source, postedAt: new Date(),
    lines: {
      create: [
        { accountId: debitAccountId, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
        { accountId: creditAccountId, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
      ],
    },
  };
}

export const debitNoteSchema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  amount: money,
  accountId: z.string().min(1, "Pick the account this charge is for"),
  description: z.string().trim().min(1, "Say what the debit note is for"),
});

/** Adds a charge to a resident's account that isn't the monthly fee. */
export async function postDebitNote(input: z.infer<typeof debitNoteSchema>, associationId = DEFAULT_ASSOCIATION_ID) {
  const data = debitNoteSchema.parse(input);
  const amount = positive(data.amount);
  const date = new Date(data.date);
  const ar = await controlAccount("AR", associationId);
  const noteNo = await nextNumber("DEBIT_NOTE", date, associationId);
  const entryData = await journal(date, "debitnote", `Debit note ${noteNo} — ${data.description}`, noteNo, ar.id, data.accountId, amount, associationId);
  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({ data: entryData });
    const charge = await tx.charge.create({
      data: {
        associationId, residentId: data.residentId, invoiceNo: noteNo, kind: "DEBIT_NOTE", creditAccountId: data.accountId,
        periodMonth: date.getUTCMonth() + 1, periodYear: date.getUTCFullYear(), amount: amount.toFixed(2),
        description: `Debit note — ${data.description}`, date, entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: charge.id } });
    return { id: charge.id, noteNo };
  });
}

export const creditNoteSchema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  amount: money,
  accountId: z.string().min(1, "Pick the account to reduce, e.g. security fees"),
  description: z.string().trim().min(1, "Say why the credit note is given"),
});

/** Reduces what a resident owes, set against their oldest open charges. */
export async function postCreditNote(input: z.infer<typeof creditNoteSchema>, associationId = DEFAULT_ASSOCIATION_ID) {
  const data = creditNoteSchema.parse(input);
  const amount = positive(data.amount);
  const date = new Date(data.date);
  const ar = await controlAccount("AR", associationId);
  const noteNo = await nextNumber("CREDIT_NOTE", date, associationId);

  const allocations: { chargeId: string; amount: Decimal }[] = [];
  let left = amount;
  for (const c of await residentOutstanding(data.residentId)) {
    if (left.lte(0)) break;
    if (c.open.lte(0)) continue;
    const take = Decimal.min(c.open, left);
    allocations.push({ chargeId: c.id, amount: take });
    left = left.minus(take);
  }

  const entryData = await journal(date, "creditnote", `Credit note ${noteNo} — ${data.description}`, noteNo, data.accountId, ar.id, amount, associationId);
  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({ data: entryData });
    const note = await tx.receipt.create({
      data: {
        associationId, receiptNo: noteNo, residentId: data.residentId, date, amount: amount.toFixed(2),
        method: "CREDIT_NOTE", contraAccountId: data.accountId, receivedFrom: data.description, entryId: entry.id,
        allocations: { create: allocations.map((a) => ({ chargeId: a.chargeId, amount: a.amount.toFixed(2) })) },
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: note.id } });
    return { id: note.id, noteNo };
  });
}

export const refundSchema = z.object({
  residentId: z.string().min(1),
  date: z.string().min(1),
  amount: money,
  method: z.enum(["BANK", "CASH"]),
  voucherNo: z.string().trim().optional(),
  chequeNo: z.string().trim().optional(),
  description: z.string().trim().min(1, "Say why the money is refunded"),
});

/** Pays back money a resident has overpaid. Only a resident in credit can be refunded. */
export async function postRefund(input: z.infer<typeof refundSchema>, associationId = DEFAULT_ASSOCIATION_ID) {
  const data = refundSchema.parse(input);
  const amount = positive(data.amount);
  const date = new Date(data.date);

  const [charged, paid] = await Promise.all([
    db.charge.aggregate({ where: { residentId: data.residentId, voided: false }, _sum: { amount: true } }),
    db.receipt.aggregate({ where: { residentId: data.residentId, voided: false }, _sum: { amount: true } }),
  ]);
  const credit = new Decimal(paid._sum.amount?.toString() ?? 0).minus(charged._sum.amount?.toString() ?? 0);
  if (amount.gt(credit)) {
    throw new Error(credit.gt(0)
      ? `This resident is only RM ${credit.toFixed(2)} in credit, so no more than that can be refunded.`
      : "This resident isn't in credit, so there is nothing to refund.");
  }

  let voucherNo = data.voucherNo?.replace(/\s+/g, "").toUpperCase();
  if (voucherNo) {
    if (await numberInUse("CASH_OUT", voucherNo, associationId)) throw new Error(`${voucherNo} is already in the system. Check the number in the voucher book.`);
  } else {
    voucherNo = await nextNumber("CASH_OUT", date, associationId);
  }
  const ar = await controlAccount("AR", associationId);
  const bankOrCash = await paymentMethodAccount(data.method);
  const entryData = await journal(date, "refund", `Refund ${voucherNo} — ${data.description}`, voucherNo, ar.id, bankOrCash.id, amount, associationId);
  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({ data: entryData });
    const charge = await tx.charge.create({
      data: {
        associationId, residentId: data.residentId, kind: "REFUND", creditAccountId: bankOrCash.id, method: data.method,
        voucherNo, chequeNo: data.chequeNo || null,
        periodMonth: date.getUTCMonth() + 1, periodYear: date.getUTCFullYear(), amount: amount.toFixed(2),
        description: `Refund — ${data.description}`, date, entryId: entry.id,
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: charge.id } });
    // Settle the refund from the payments that put the resident in credit, oldest
    // first, so it doesn't show as a new amount owed in ageing and statements.
    const receipts = await tx.receipt.findMany({
      where: { residentId: data.residentId, voided: false },
      include: { allocations: true },
      orderBy: { date: "asc" },
    });
    let left = amount;
    for (const r of receipts) {
      if (left.lte(0)) break;
      const free = new Decimal(r.amount.toString()).minus(r.allocations.reduce((s, x) => s.plus(x.amount.toString()), new Decimal(0)));
      if (free.lte(0)) continue;
      const take = Decimal.min(free, left);
      await tx.paymentAllocation.create({ data: { receiptId: r.id, chargeId: charge.id, amount: take.toFixed(2) } });
      left = left.minus(take);
    }
    return { id: charge.id, voucherNo: voucherNo! };
  });
}

export const supplierDebitNoteSchema = z.object({
  billId: z.string().min(1),
  date: z.string().min(1),
  amount: money,
  accountId: z.string().optional(),
  description: z.string().trim().min(1, "Say why the bill is reduced"),
});

/** Our debit note to a supplier: reduces what we owe on a bill, with no money paid. */
export async function postSupplierDebitNote(input: z.infer<typeof supplierDebitNoteSchema>, associationId = DEFAULT_ASSOCIATION_ID) {
  const data = supplierDebitNoteSchema.parse(input);
  const amount = positive(data.amount);
  const bill = await db.bill.findUniqueOrThrow({ where: { id: data.billId } });
  if (bill.status === "VOIDED") throw new Error("This bill is voided.");
  const open = new Decimal(bill.amount.toString()).minus(bill.paid.toString());
  if (amount.gt(open)) throw new Error(`The bill only has RM ${open.toFixed(2)} still owing.`);
  const date = new Date(data.date);
  const accountId = data.accountId || bill.expenseAccountId;
  const ap = await controlAccount("AP", associationId);
  const noteNo = await nextNumber("SUPPLIER_DN", date, associationId);
  const entryData = await journal(date, "supplierdebitnote", `Debit note ${noteNo} on ${bill.invoiceNo} — ${data.description}`, noteNo, ap.id, accountId, amount, associationId);
  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({ data: entryData });
    await tx.billPayment.create({
      data: {
        billId: bill.id, date, amount: amount.toFixed(2), method: "DEBIT_NOTE", voucherNo: noteNo,
        paymentFor: data.description, contraAccountId: accountId, entryId: entry.id,
      },
    });
    const paid = new Decimal(bill.paid.toString()).plus(amount);
    await tx.bill.update({ where: { id: bill.id }, data: { paid: paid.toFixed(2), status: paid.gte(bill.amount.toString()) ? "PAID" : "PARTIAL" } });
    return { noteNo };
  });
}
