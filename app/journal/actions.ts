"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { linesBalance, prepareEntry } from "@/lib/journal";
import { assertPeriodOpen } from "@/lib/periods";

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.string().default("0"),
  credit: z.string().default("0"),
  memo: z.string().optional(),
});

const entrySchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(2),
});

export type EntryInput = z.infer<typeof entrySchema>;

function validateLines(lines: z.infer<typeof lineSchema>[]) {
  const cleaned = lines
    .map((l) => ({
      accountId: l.accountId,
      debit: new Decimal(l.debit || 0),
      credit: new Decimal(l.credit || 0),
      memo: l.memo ?? null,
    }))
    .filter((l) => l.debit.gt(0) || l.credit.gt(0));
  if (cleaned.length < 2) throw new Error("At least two lines required");
  for (const l of cleaned) {
    if (l.debit.gt(0) && l.credit.gt(0)) throw new Error("A line cannot have both debit and credit");
    if (l.debit.lt(0) || l.credit.lt(0)) throw new Error("Amounts must be non-negative");
  }
  const bal = linesBalance(cleaned);
  if (!bal.balanced) throw new Error(`Debit ${bal.debit} ≠ Credit ${bal.credit}`);
  return cleaned;
}

export async function saveDraft(input: EntryInput) {
  const data = entrySchema.parse(input);
  const cleaned = validateLines(data.lines);

  if (data.id) {
    const existing = await db.journalEntry.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("Entry not found");
    if (existing.status !== "DRAFT") throw new Error("Only draft entries can be edited");
    await assertPeriodOpen(new Date(data.date));
    await db.$transaction([
      db.journalLine.deleteMany({ where: { entryId: data.id } }),
      db.journalEntry.update({
        where: { id: data.id },
        data: {
          date: new Date(data.date),
          description: data.description,
          reference: data.reference,
          lines: {
            create: cleaned.map((l, i) => ({ ...l, lineNo: i + 1 })),
          },
        },
      }),
    ]);
    revalidatePath("/journal");
    revalidatePath(`/journal/${data.id}`);
    return { id: data.id };
  }

  const { entryNo, batchId } = await prepareEntry(new Date(data.date), "manual");
  const created = await db.journalEntry.create({
    data: {
      associationId: DEFAULT_ASSOCIATION_ID,
      entryNo,
      batchId,
      date: new Date(data.date),
      description: data.description,
      reference: data.reference,
      status: "DRAFT",
      lines: { create: cleaned.map((l, i) => ({ ...l, lineNo: i + 1 })) },
    },
  });
  revalidatePath("/journal");
  return { id: created.id };
}

export async function postEntry(id: string) {
  const entry = await db.journalEntry.findUnique({ where: { id }, include: { lines: true } });
  if (!entry) throw new Error("Not found");
  if (entry.status !== "DRAFT") throw new Error("Only drafts can be posted");
  await assertPeriodOpen(entry.date);
  validateLines(entry.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.debit.toString(),
    credit: l.credit.toString(),
    memo: l.memo ?? undefined,
  })));
  await db.journalEntry.update({
    where: { id },
    data: { status: "POSTED", postedAt: new Date() },
  });
  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
}

export async function voidEntry(id: string, reason: string) {
  const entry = await db.journalEntry.findUnique({ where: { id }, include: { lines: true } });
  if (!entry) throw new Error("Not found");
  if (entry.status !== "POSTED") throw new Error("Only posted entries can be voided");
  const rev = await prepareEntry(new Date(), "reversal");
  await db.$transaction(async (tx) => {
    await tx.journalEntry.create({
      data: {
        associationId: entry.associationId,
        entryNo: rev.entryNo,
        batchId: rev.batchId,
        date: new Date(),
        description: `Reversal of ${entry.entryNo}: ${reason}`,
        reference: entry.reference,
        status: "POSTED",
        postedAt: new Date(),
        source: "reversal",
        reversesId: entry.id,
        lines: {
          create: entry.lines.map((l, i) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            memo: l.memo,
            lineNo: i + 1,
          })),
        },
      },
    });
    await tx.journalEntry.update({
      where: { id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
    });
  });
  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
}

export async function createDraftAndEdit() {
  redirect("/journal/new");
}
