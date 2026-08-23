import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { nextEntryNo } from "./journal";
import { controlAccount } from "./control-accounts";

/**
 * Opening balances — the balances carried over from the previous system at
 * cut-over. Three separate pieces, mirroring how the accountant already works:
 *
 *   1. GL opening balances     — one journal entry, must balance
 *   2. Debtor brought-forward  — what each resident owed on day one
 *   3. Creditor brought-forward — what was owed to each supplier
 *
 * The subsidiary rows (2 and 3) deliberately carry NO journal entry of their own.
 * Their GL effect is already in the single opening entry from (1); posting them
 * individually would double-count the control accounts and push prior-year income
 * into this year's P&L. `openingBalanceCheck` is what proves the two agree.
 */

export const OPENING_SOURCE = "opening";

export async function getOpeningDate(associationId = DEFAULT_ASSOCIATION_ID): Promise<Date> {
  const a = await db.association.findUnique({
    where: { id: associationId },
    select: { openingDate: true },
  });
  if (a?.openingDate) return a.openingDate;
  // Default: the last day of the year before the current one.
  return new Date(Date.UTC(new Date().getFullYear() - 1, 11, 31));
}

export async function setOpeningDate(date: Date, associationId = DEFAULT_ASSOCIATION_ID) {
  await db.association.update({ where: { id: associationId }, data: { openingDate: date } });
}

async function assertYearOpen(date: Date, associationId = DEFAULT_ASSOCIATION_ID) {
  const fy = await db.fiscalYear.findUnique({
    where: { associationId_year: { associationId, year: date.getFullYear() } },
    select: { year: true, closed: true },
  });
  if (fy?.closed) {
    throw new Error(
      `Financial year ${fy.year} is closed — reopen it before changing opening balances.`,
    );
  }
}

// ---------------------------------------------------------------- GL

export async function getOpeningEntry(associationId = DEFAULT_ASSOCIATION_ID) {
  return db.journalEntry.findFirst({
    where: { associationId, source: OPENING_SOURCE, status: { not: "VOIDED" } },
    include: { lines: { include: { account: true }, orderBy: { lineNo: "asc" } } },
  });
}

export type GLOpeningRow = { accountId: string; debit: string; credit: string };

/** All balance-sheet accounts, with whatever opening amount is already keyed. */
export async function getGLOpeningRows(associationId = DEFAULT_ASSOCIATION_ID) {
  const [accounts, entry] = await Promise.all([
    db.account.findMany({
      where: { associationId, active: true, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
      orderBy: { code: "asc" },
    }),
    getOpeningEntry(associationId),
  ]);

  const byAccount = new Map(entry?.lines.map((l) => [l.accountId, l]) ?? []);
  return accounts.map((a) => {
    const line = byAccount.get(a.id);
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      group: a.group,
      normalSide: a.normalSide,
      debit: line ? new Decimal(line.debit.toString()).toFixed(2) : "0.00",
      credit: line ? new Decimal(line.credit.toString()).toFixed(2) : "0.00",
    };
  });
}

/**
 * Writes the opening entry, replacing any previous one. Deliberately bypasses the
 * period lock — opening balances are dated inside the locked prior year by design,
 * so the lock cannot be the thing that stops you keying them.
 */
export async function saveGLOpening(
  rows: GLOpeningRow[],
  date: Date,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  await assertYearOpen(date, associationId);

  const lines = rows
    .map((r) => ({
      accountId: r.accountId,
      debit: new Decimal(r.debit || 0),
      credit: new Decimal(r.credit || 0),
    }))
    .filter((l) => l.debit.gt(0) || l.credit.gt(0));

  for (const l of lines) {
    if (l.debit.gt(0) && l.credit.gt(0)) {
      throw new Error("An account cannot have both a debit and a credit opening balance");
    }
    if (l.debit.lt(0) || l.credit.lt(0)) throw new Error("Opening amounts cannot be negative");
  }

  const totalDr = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
  const totalCr = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
  if (!totalDr.equals(totalCr)) {
    throw new Error(
      `Opening balances do not balance — debit ${totalDr.toFixed(2)} against credit ${totalCr.toFixed(2)}, a difference of ${totalDr.minus(totalCr).abs().toFixed(2)}.`,
    );
  }

  const existing = await getOpeningEntry(associationId);
  const entryNo = existing?.entryNo ?? (await nextEntryNo(associationId));

  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.journalLine.deleteMany({ where: { entryId: existing.id } });
      await tx.journalEntry.update({
        where: { id: existing.id },
        data: {
          date,
          description: "Opening balances brought forward",
          lines: { create: lines.map((l, i) => ({
            accountId: l.accountId,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
            lineNo: i + 1,
          })) },
        },
      });
    } else {
      await tx.journalEntry.create({
        data: {
          associationId,
          entryNo,
          date,
          description: "Opening balances brought forward",
          status: "POSTED",
          source: OPENING_SOURCE,
          postedAt: new Date(),
          lines: { create: lines.map((l, i) => ({
            accountId: l.accountId,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
            lineNo: i + 1,
          })) },
        },
      });
    }
  });

  await setOpeningDate(date, associationId);
  return { totalDr: totalDr.toFixed(2), lines: lines.length };
}

// ---------------------------------------------------------------- Debtors

export async function getDebtorOpeningRows(associationId = DEFAULT_ASSOCIATION_ID) {
  const residents = await db.resident.findMany({
    where: { associationId },
    orderBy: { debtorCode: "asc" },
    include: {
      charges: { where: { isOpeningBalance: true, voided: false } },
      receipts: { where: { isOpeningBalance: true, voided: false } },
    },
  });

  return residents.map((r) => {
    const owing = r.charges.reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0));
    const advance = r.receipts.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    return {
      residentId: r.id,
      debtorCode: r.debtorCode,
      unitAddress: r.unitAddress,
      ownerName: r.ownerName,
      active: r.active,
      // Positive = owes us, negative = paid in advance.
      amount: owing.minus(advance).toFixed(2),
    };
  });
}

export type DebtorOpeningRow = { residentId: string; amount: string };

export async function saveDebtorOpening(
  rows: DebtorOpeningRow[],
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const date = await getOpeningDate(associationId);
  await assertYearOpen(date, associationId);

  const residents = await db.resident.findMany({
    where: { associationId },
    select: { id: true, debtorCode: true, unitAddress: true },
  });
  const byId = new Map(residents.map((r) => [r.id, r]));

  let owing = 0, advance = 0, cleared = 0;

  for (const row of rows) {
    const resident = byId.get(row.residentId);
    if (!resident) continue;
    const amount = new Decimal(row.amount || 0);
    const key = resident.debtorCode ?? resident.unitAddress;

    // Wipe whatever was there before, so re-keying is always a clean replace.
    const oldCharges = await db.charge.findMany({
      where: { residentId: resident.id, isOpeningBalance: true },
      select: { id: true },
    });
    if (oldCharges.length) {
      await db.paymentAllocation.deleteMany({
        where: { chargeId: { in: oldCharges.map((c) => c.id) } },
      });
      await db.charge.deleteMany({ where: { id: { in: oldCharges.map((c) => c.id) } } });
    }
    await db.receipt.deleteMany({ where: { residentId: resident.id, isOpeningBalance: true } });

    if (amount.isZero()) { cleared++; continue; }

    if (amount.gt(0)) {
      await db.charge.create({
        data: {
          associationId,
          residentId: resident.id,
          invoiceNo: `BF-${key}`,
          periodMonth: date.getMonth() + 1,
          periodYear: date.getFullYear(),
          amount: amount.toFixed(2),
          description: "Balance brought forward",
          date,
          isOpeningBalance: true,
        },
      });
      owing++;
    } else {
      // Resident was in credit at cut-over: an unallocated payment, not a negative
      // invoice, so the ageing buckets stay clean.
      await db.receipt.create({
        data: {
          associationId,
          receiptNo: `BF-${key}`,
          residentId: resident.id,
          date,
          amount: amount.abs().toFixed(2),
          method: "BF",
          isOpeningBalance: true,
        },
      });
      advance++;
    }
  }

  return { owing, advance, cleared };
}

// ---------------------------------------------------------------- Creditors

export async function getCreditorOpeningRows(associationId = DEFAULT_ASSOCIATION_ID) {
  const suppliers = await db.supplier.findMany({
    where: { associationId },
    orderBy: { name: "asc" },
    include: { bills: { where: { isOpeningBalance: true, status: { not: "VOIDED" } } } },
  });

  return suppliers.map((s) => {
    const total = s.bills.reduce((a, b) => a.plus(new Decimal(b.amount.toString())), new Decimal(0));
    const paid = s.bills.reduce((a, b) => a.plus(new Decimal(b.paid.toString())), new Decimal(0));
    return {
      supplierId: s.id,
      creditorCode: s.creditorCode,
      name: s.name,
      active: s.active,
      amount: total.toFixed(2),
      paid: paid.toFixed(2),
    };
  });
}

export type CreditorOpeningRow = { supplierId: string; amount: string };

export async function saveCreditorOpening(
  rows: CreditorOpeningRow[],
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const date = await getOpeningDate(associationId);
  await assertYearOpen(date, associationId);

  const ap = await controlAccount("AP");
  const suppliers = await db.supplier.findMany({
    where: { associationId },
    select: { id: true, creditorCode: true, name: true },
  });
  const byId = new Map(suppliers.map((s) => [s.id, s]));

  let saved = 0, cleared = 0;

  for (const row of rows) {
    const supplier = byId.get(row.supplierId);
    if (!supplier) continue;
    const amount = new Decimal(row.amount || 0);
    if (amount.lt(0)) throw new Error(`${supplier.name}: creditor opening balance cannot be negative`);

    const old = await db.bill.findMany({
      where: { supplierId: supplier.id, isOpeningBalance: true },
      select: { id: true, paid: true },
    });
    for (const b of old) {
      if (new Decimal(b.paid.toString()).gt(0)) {
        throw new Error(
          `${supplier.name}: the brought-forward bill has payments against it. Void those payments before changing the opening balance.`,
        );
      }
    }
    if (old.length) await db.bill.deleteMany({ where: { id: { in: old.map((b) => b.id) } } });

    if (amount.isZero()) { cleared++; continue; }

    await db.bill.create({
      data: {
        associationId,
        supplierId: supplier.id,
        invoiceNo: `BF-${supplier.creditorCode ?? supplier.name}`,
        date,
        amount: amount.toFixed(2),
        expenseAccountId: ap.id,
        status: "UNPAID",
        isOpeningBalance: true,
      },
    });
    saved++;
  }

  return { saved, cleared };
}

// ---------------------------------------------------------------- Control check

/**
 * Proves the subsidiary ledgers agree with their control accounts. This is the
 * check that catches an opening balance keyed in one place but not the other —
 * the classic way these migrations go wrong silently.
 */
export async function openingBalanceCheck(associationId = DEFAULT_ASSOCIATION_ID) {
  const [entry, debtors, creditors, ar, ap] = await Promise.all([
    getOpeningEntry(associationId),
    getDebtorOpeningRows(associationId),
    getCreditorOpeningRows(associationId),
    controlAccount("AR"),
    controlAccount("AP"),
  ]);

  const line = (accountId: string) => {
    const l = entry?.lines.find((x) => x.accountId === accountId);
    if (!l) return new Decimal(0);
    return new Decimal(l.debit.toString()).minus(new Decimal(l.credit.toString()));
  };

  const arControl = line(ar.id);
  const arSub = debtors.reduce((s, d) => s.plus(new Decimal(d.amount)), new Decimal(0));
  const apControl = line(ap.id).negated();
  const apSub = creditors.reduce((s, c) => s.plus(new Decimal(c.amount)), new Decimal(0));

  const totalDr = entry?.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0)) ?? new Decimal(0);
  const totalCr = entry?.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0)) ?? new Decimal(0);

  return {
    hasEntry: Boolean(entry),
    entryNo: entry?.entryNo ?? null,
    date: entry?.date ?? null,
    totalDr: totalDr.toFixed(2),
    totalCr: totalCr.toFixed(2),
    balanced: totalDr.equals(totalCr),
    ar: {
      control: arControl.toFixed(2),
      subsidiary: arSub.toFixed(2),
      difference: arControl.minus(arSub).toFixed(2),
      agrees: arControl.equals(arSub),
    },
    ap: {
      control: apControl.toFixed(2),
      subsidiary: apSub.toFixed(2),
      difference: apControl.minus(apSub).toFixed(2),
      agrees: apControl.equals(apSub),
    },
  };
}
