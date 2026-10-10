import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import type { AccountType } from "@prisma/client";

type Range = { from?: Date; to?: Date };

export type AccountBalance = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalSide: "DEBIT" | "CREDIT";
  debit: Decimal;
  credit: Decimal;
  // Signed by the account's type, the way the statements add it up: assets and
  // expenses debit-positive, the rest credit-positive. A contra account (e.g.
  // accumulated depreciation under assets) therefore comes out negative.
  balance: Decimal;
};

export async function accountBalances(range: Range = {}): Promise<AccountBalance[]> {
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: {
          entry: {
            status: { not: "DRAFT" as const },
            ...(range.from || range.to
              ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } }
              : {}),
          },
        },
        select: { debit: true, credit: true },
      },
    },
  });

  return accounts.map((a) => {
    const debit = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
    const credit = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
    const balance = a.type === "ASSET" || a.type === "EXPENSE" ? debit.minus(credit) : credit.minus(debit);
    return { id: a.id, code: a.code, name: a.name, type: a.type, normalSide: a.normalSide, debit, credit, balance };
  });
}

export async function generalLedger(accountId: string, range: Range = {}) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");

  // Opening balance: all posted activity strictly before range.from
  let opening = new Decimal(0);
  if (range.from) {
    const prior = await db.journalLine.findMany({
      where: { accountId, entry: { status: { not: "DRAFT" as const }, date: { lt: range.from } } },
      select: { debit: true, credit: true },
    });
    const d = prior.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
    const c = prior.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
    opening = account.normalSide === "DEBIT" ? d.minus(c) : c.minus(d);
  }

  const lines = await db.journalLine.findMany({
    where: {
      accountId,
      entry: {
        status: { not: "DRAFT" as const },
        ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
      },
    },
    include: { entry: true },
    orderBy: [{ entry: { date: "asc" } }, { entry: { entryNo: "asc" } }, { lineNo: "asc" }],
  });

  let running = opening;
  const rows = lines.map((l) => {
    const d = new Decimal(l.debit.toString());
    const c = new Decimal(l.credit.toString());
    running = account.normalSide === "DEBIT" ? running.plus(d).minus(c) : running.plus(c).minus(d);
    return {
      date: l.entry.date,
      entryNo: l.entry.entryNo,
      description: l.entry.description,
      memo: l.memo,
      debit: d,
      credit: c,
      balance: running,
    };
  });

  return { account, opening, rows, closing: running };
}

export type TrialBalanceRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  /** Balance before the period, debit-positive. */
  opening: Decimal;
  /** Movements within the period. */
  debit: Decimal;
  credit: Decimal;
  /** Balance at the end of the period, debit-positive. */
  closing: Decimal;
};

/**
 * Trial balance rows. With only `to`, it is the year-to-date trial balance as
 * at that date: every account's balance including the opening balances and
 * everything posted before (opening is zero, the movement is the whole
 * history). With `from` as well, it splits each account into the balance
 * brought forward, the period's debits and credits, and the closing balance.
 */
export async function trialBalanceRows(range: Range = {}): Promise<TrialBalanceRow[]> {
  const before = range.from ? await accountBalances({ to: new Date(range.from.getTime() - 1) }) : null;
  const during = await accountBalances({ from: range.from, to: range.to });
  const openingOf = new Map((before ?? []).map((a) => [a.id, a.debit.minus(a.credit)]));
  return during
    .map((a) => {
      const opening = openingOf.get(a.id) ?? new Decimal(0);
      return {
        id: a.id, code: a.code, name: a.name, type: a.type, opening,
        debit: a.debit, credit: a.credit, closing: opening.plus(a.debit).minus(a.credit),
      };
    })
    .filter((r) => !r.opening.eq(0) || !r.debit.eq(0) || !r.credit.eq(0) || !r.closing.eq(0));
}

export type LedgerSection = {
  account: { id: string; code: string; name: string };
  /** Balance brought forward, debit-positive. */
  opening: Decimal;
  rows: { date: Date; batch: string; ref: string; description: string; debit: Decimal; credit: Decimal; balance: Decimal }[];
  debit: Decimal;
  credit: Decimal;
  closing: Decimal;
};

/**
 * The general ledger for every account (or one), laid out like the printed
 * ledger: each account opens with its balance brought forward to the start of
 * the period, then the period's entries with a running balance. Accounts with
 * a balance but no movement still appear, showing just the brought-forward line.
 */
export async function generalLedgerAll(range: Range & { accountId?: string } = {}): Promise<LedgerSection[]> {
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, ...(range.accountId ? { id: range.accountId } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const before = range.from ? await accountBalances({ to: new Date(range.from.getTime() - 1) }) : [];
  const openingOf = new Map(before.map((a) => [a.id, a.debit.minus(a.credit)]));
  const lines = await db.journalLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      entry: {
        associationId: DEFAULT_ASSOCIATION_ID,
        status: { not: "DRAFT" },
        ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
      },
    },
    include: { entry: { select: { date: true, entryNo: true, reference: true, description: true, batch: { select: { batchNo: true } } } } },
    orderBy: [{ entry: { date: "asc" } }, { entry: { entryNo: "asc" } }, { lineNo: "asc" }],
  });
  const byAccount = Map.groupBy(lines, (l) => l.accountId);

  return accounts
    .map((account) => {
      const opening = openingOf.get(account.id) ?? new Decimal(0);
      let running = opening;
      let debit = new Decimal(0), credit = new Decimal(0);
      const rows = (byAccount.get(account.id) ?? []).map((l) => {
        const d = new Decimal(l.debit.toString()), c = new Decimal(l.credit.toString());
        running = running.plus(d).minus(c);
        debit = debit.plus(d); credit = credit.plus(c);
        return {
          date: l.entry.date,
          batch: l.entry.batch?.batchNo ?? "",
          ref: l.entry.reference ?? l.entry.entryNo,
          description: l.memo ? `${l.entry.description} — ${l.memo}` : l.entry.description,
          debit: d, credit: c, balance: running,
        };
      });
      return { account, opening, rows, debit, credit, closing: running };
    })
    .filter((s) => !s.opening.eq(0) || s.rows.length > 0);
}
