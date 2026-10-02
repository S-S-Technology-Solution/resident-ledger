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

/** Adds `n` to the trailing number of a document number, keeping its width: 26001 → 26002. */
function bump(no: string, n: number) {
  const m = no.match(/^(.*?)(\d+)$/);
  if (!m) throw new Error(`Can't continue numbering from "${no}"`);
  return m[1] + String(Number(m[2]) + n).padStart(m[2].length, "0");
}

/**
 * Raises a month's fees for many residents at once, all on one date.
 *
 * Posting them one by one costs several round trips each, which for a whole
 * estate outruns a request's time limit. Here the period check, batch and first
 * numbers are fetched once, ids are made up front, and every entry, line and
 * charge goes in with one insert each, in a single transaction.
 */
export async function postChargesBulk(items: ChargeInput[], associationId = DEFAULT_ASSOCIATION_ID) {
  if (!items.length) return 0;
  const parsed = items.map((i) => chargeSchema.parse(i));
  const date = new Date(parsed[0].date);
  if (parsed.some((p) => new Date(p.date).getTime() !== date.getTime())) {
    throw new Error("A bulk run raises charges on a single date.");
  }
  for (const p of parsed) if (new Decimal(p.amount).lte(0)) throw new Error("Amount must be positive");

  const ar = await controlAccount("AR", associationId);
  const income = await controlAccount("INCOME_FEE", associationId);
  const { entryNo: firstEntryNo, batchId } = await prepareEntry(date, "charge", associationId);
  const firstInvoiceNo = await nextInvoiceNo(associationId, date);
  const postedAt = new Date();

  const rows = parsed.map((p, i) => ({
    entryId: crypto.randomUUID(),
    chargeId: crypto.randomUUID(),
    entryNo: bump(firstEntryNo, i),
    invoiceNo: bump(firstInvoiceNo, i),
    amount: new Decimal(p.amount).toFixed(2),
    p,
  }));

  await db.$transaction([
    db.journalEntry.createMany({
      data: rows.map((r) => ({
        id: r.entryId, associationId, entryNo: r.entryNo, batchId, date, description: r.p.description,
        status: "POSTED" as const, source: "charge", sourceId: r.chargeId, postedAt,
      })),
    }),
    db.journalLine.createMany({
      data: rows.flatMap((r) => [
        { entryId: r.entryId, accountId: ar.id, debit: r.amount, credit: "0", lineNo: 1 },
        { entryId: r.entryId, accountId: income.id, debit: "0", credit: r.amount, lineNo: 2 },
      ]),
    }),
    db.charge.createMany({
      data: rows.map((r) => ({
        id: r.chargeId, associationId, residentId: r.p.residentId, invoiceNo: r.invoiceNo,
        periodMonth: r.p.periodMonth, periodYear: r.p.periodYear, amount: r.amount,
        description: r.p.description, date, entryId: r.entryId,
      })),
    }),
  ]);
  return rows.length;
}
