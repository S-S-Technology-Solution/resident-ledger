import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { nextEntryNo } from "./journal";
import { ensureBatch } from "./batches";

/**
 * Year-end closing. Zeroes the income and expense accounts into the accumulated
 * fund, records the year's surplus, and locks the year so nothing can be posted
 * back into it.
 *
 * The balance sheet computes the current year's result live from the P&L accounts,
 * so once they are zeroed the same figure appears inside equity instead — it is
 * never counted twice.
 */

const ACCUMULATED_FUND = "1000/0000";
const SURPLUS_ACCOUNT = "1001/0000";

function yearEnd(year: number) {
  return new Date(Date.UTC(year, 11, 31));
}

async function plBalances(year: number, associationId = DEFAULT_ASSOCIATION_ID) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const accounts = await db.account.findMany({
    where: { associationId, type: { in: ["INCOME", "EXPENSE"] } },
    include: {
      lines: {
        where: { entry: { status: "POSTED", date: { gte: from, lte: to } } },
        select: { debit: true, credit: true },
      },
    },
    orderBy: { code: "asc" },
  });

  return accounts
    .map((a) => {
      const dr = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
      const cr = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
      // Income sits credit-side, expenses debit-side; keep each as a positive figure.
      const balance = a.type === "INCOME" ? cr.minus(dr) : dr.minus(cr);
      return { id: a.id, code: a.code, name: a.name, type: a.type, balance };
    })
    .filter((a) => !a.balance.isZero());
}

export async function previewYearEnd(year: number, associationId = DEFAULT_ASSOCIATION_ID) {
  const rows = await plBalances(year, associationId);
  const income = rows.filter((r) => r.type === "INCOME");
  const expense = rows.filter((r) => r.type === "EXPENSE");
  const totalIncome = income.reduce((s, r) => s.plus(r.balance), new Decimal(0));
  const totalExpense = expense.reduce((s, r) => s.plus(r.balance), new Decimal(0));
  const surplus = totalIncome.minus(totalExpense);

  const fy = await db.fiscalYear.findUnique({
    where: { associationId_year: { associationId, year } },
  });

  const draftCount = await db.journalEntry.count({
    where: {
      associationId,
      status: "DRAFT",
      date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) },
    },
  });

  return {
    year,
    income,
    expense,
    totalIncome: totalIncome.toFixed(2),
    totalExpense: totalExpense.toFixed(2),
    surplus: surplus.toFixed(2),
    isDeficit: surplus.isNegative(),
    closed: fy?.closed ?? false,
    closedAt: fy?.closedAt ?? null,
    draftCount,
  };
}

export async function closeYear(
  year: number,
  closedBy?: string,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const existing = await db.fiscalYear.findUnique({
    where: { associationId_year: { associationId, year } },
  });
  if (existing?.closed) throw new Error(`Financial year ${year} is already closed.`);

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const drafts = await db.journalEntry.count({
    where: { associationId, status: "DRAFT", date: { gte: from, lte: to } },
  });
  if (drafts > 0) {
    throw new Error(
      `${drafts} unposted draft ${drafts === 1 ? "entry" : "entries"} still sit in ${year}. Post or delete them before closing.`,
    );
  }

  const fund = await db.account.findUnique({
    where: { associationId_code: { associationId, code: ACCUMULATED_FUND } },
  });
  if (!fund) throw new Error(`Account ${ACCUMULATED_FUND} (Accumulated Fund) not found.`);

  const rows = await plBalances(year, associationId);
  if (rows.length === 0) throw new Error(`No income or expenditure posted in ${year} — nothing to close.`);

  const totalIncome = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s.plus(r.balance), new Decimal(0));
  const totalExpense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s.plus(r.balance), new Decimal(0));
  const surplus = totalIncome.minus(totalExpense);

  const date = yearEnd(year);
  const entryNo = await nextEntryNo(associationId);
  const batch = await ensureBatch("JOURNAL", date, associationId);

  // Contra each P&L account against its own balance, then take the net to the fund.
  const lines = rows.map((r, i) => ({
    accountId: r.id,
    debit: r.type === "INCOME" ? r.balance.toFixed(2) : "0",
    credit: r.type === "INCOME" ? "0" : r.balance.toFixed(2),
    memo: `Closing ${r.code}`,
    lineNo: i + 1,
  }));
  lines.push({
    accountId: fund.id,
    debit: surplus.isNegative() ? surplus.abs().toFixed(2) : "0",
    credit: surplus.isNegative() ? "0" : surplus.toFixed(2),
    memo: surplus.isNegative() ? `Deficit for ${year}` : `Surplus for ${year}`,
    lineNo: lines.length + 1,
  });

  const entry = await db.$transaction(async (tx) => {
    const e = await tx.journalEntry.create({
      data: {
        associationId,
        entryNo,
        batchId: batch.id,
        date,
        description: `Year end closing ${year}`,
        status: "POSTED",
        source: "yearend",
        postedAt: new Date(),
        lines: { create: lines },
      },
    });

    await tx.fiscalYear.upsert({
      where: { associationId_year: { associationId, year } },
      update: { closed: true, closedAt: new Date(), closedBy, closingEntryId: e.id, surplus: surplus.toFixed(2) },
      create: {
        associationId, year, closed: true, closedAt: new Date(), closedBy,
        closingEntryId: e.id, surplus: surplus.toFixed(2),
      },
    });

    // Move the soft lock forward too, unless it is already later.
    const assoc = await tx.association.findUnique({
      where: { id: associationId }, select: { lockedThrough: true },
    });
    if (!assoc?.lockedThrough || assoc.lockedThrough < date) {
      await tx.association.update({ where: { id: associationId }, data: { lockedThrough: date } });
    }

    return e;
  });

  return { entryNo: entry.entryNo, surplus: surplus.toFixed(2), accounts: rows.length };
}

/** Reverses a close so the year can be corrected. */
export async function reopenYear(year: number, associationId = DEFAULT_ASSOCIATION_ID) {
  const fy = await db.fiscalYear.findUnique({
    where: { associationId_year: { associationId, year } },
  });
  if (!fy?.closed) throw new Error(`Financial year ${year} is not closed.`);

  const later = await db.fiscalYear.findFirst({
    where: { associationId, closed: true, year: { gt: year } },
    orderBy: { year: "asc" },
  });
  if (later) {
    throw new Error(
      `Financial year ${later.year} was closed after this one. Reopen ${later.year} first.`,
    );
  }

  await db.$transaction(async (tx) => {
    if (fy.closingEntryId) {
      await tx.journalLine.deleteMany({ where: { entryId: fy.closingEntryId } });
      await tx.journalEntry.delete({ where: { id: fy.closingEntryId } });
    }
    await tx.fiscalYear.update({
      where: { id: fy.id },
      data: { closed: false, closedAt: null, closedBy: null, closingEntryId: null, surplus: null },
    });
    // Wind the soft lock back to the end of the previous year.
    await tx.association.update({
      where: { id: associationId },
      data: { lockedThrough: new Date(Date.UTC(year - 1, 11, 31)) },
    });
  });
}

export async function listFiscalYears(associationId = DEFAULT_ASSOCIATION_ID) {
  const [years, earliest, assoc] = await Promise.all([
    db.fiscalYear.findMany({ where: { associationId }, orderBy: { year: "desc" } }),
    db.journalEntry.findFirst({
      where: { associationId, status: "POSTED" },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    db.association.findUnique({ where: { id: associationId }, select: { lockedThrough: true } }),
  ]);

  const first = earliest?.date.getFullYear() ?? new Date().getFullYear();
  const last = new Date().getFullYear();
  const known = new Map(years.map((y) => [y.year, y]));

  const all: { year: number; closed: boolean; closedAt: Date | null; surplus: string | null }[] = [];
  for (let y = last; y >= first; y--) {
    const rec = known.get(y);
    all.push({
      year: y,
      closed: rec?.closed ?? false,
      closedAt: rec?.closedAt ?? null,
      surplus: rec?.surplus ? new Decimal(rec.surplus.toString()).toFixed(2) : null,
    });
  }
  return { years: all, lockedThrough: assoc?.lockedThrough ?? null };
}
