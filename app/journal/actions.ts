"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { linesBalance, prepareEntry } from "@/lib/journal";
import { assertPeriodOpen } from "@/lib/periods";
import { requirePosting } from "@/lib/permissions";
import { attempt } from "@/lib/action-server";
import { controlAccount } from "@/lib/control-accounts";
import { RESIDENT_PICK, postResidentLines, voidResidentLines } from "@/lib/journal-residents";

const lineSchema = z.object({
  // An account, or a resident's debtor account as RESIDENT_PICK + resident id.
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

/** Lines as stored: a resident's line goes on the AR control account, tagged with the resident. */
async function toStoredLines(lines: ReturnType<typeof validateLines>) {
  const residentIds = lines.filter((l) => l.accountId.startsWith(RESIDENT_PICK)).map((l) => l.accountId.slice(RESIDENT_PICK.length));
  if (!residentIds.length) return lines.map((l, i) => ({ ...l, residentId: null, lineNo: i + 1 }));
  const [ar, residents] = await Promise.all([
    controlAccount("AR"),
    db.resident.findMany({ where: { id: { in: residentIds } }, select: { id: true, debtorCode: true, ownerName: true } }),
  ]);
  const byId = new Map(residents.map((r) => [r.id, r]));
  return lines.map((l, i) => {
    if (!l.accountId.startsWith(RESIDENT_PICK)) return { ...l, residentId: null, lineNo: i + 1 };
    const r = byId.get(l.accountId.slice(RESIDENT_PICK.length));
    if (!r) throw new Error("A debtor account on this voucher is no longer in the system");
    // The G/L shows only the control account, so the memo says whose account it is.
    return { ...l, accountId: ar.id, residentId: r.id, memo: l.memo || `${r.debtorCode ?? ""} ${r.ownerName}`.trim(), lineNo: i + 1 };
  });
}

export async function saveDraft(input: EntryInput) {
  return attempt(async () => {
    await requirePosting();
    const data = entrySchema.parse(input);
    const cleaned = await toStoredLines(validateLines(data.lines));

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
              create: cleaned,
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
        lines: { create: cleaned },
      },
    });
    revalidatePath("/journal");
    return { id: created.id };
  });
}

export async function postEntry(id: string) {
  return attempt(async () => {
    await requirePosting();
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
    await db.$transaction(async (tx) => {
      await tx.journalEntry.update({
        where: { id },
        data: { status: "POSTED", postedAt: new Date() },
      });
      await postResidentLines(tx, entry);
    }, { timeout: 30_000 }); // a voucher may carry many residents' lines
    revalidatePath("/journal");
    revalidatePath(`/journal/${id}`);
  });
}

export async function voidEntry(id: string, reason: string) {
  return attempt(async () => {
    await requirePosting();
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
              residentId: l.residentId,
              lineNo: i + 1,
            })),
          },
        },
      });
      await voidResidentLines(tx, entry.id);
      await tx.journalEntry.update({
        where: { id },
        data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
      });
    });
    revalidatePath("/journal");
    revalidatePath(`/journal/${id}`);
  });
}

export async function createDraftAndEdit() {
  await requirePosting();
  redirect("/journal/new");
}
