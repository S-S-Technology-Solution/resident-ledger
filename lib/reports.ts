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
  balance: Decimal; // signed: positive on normal side
};

export async function accountBalances(range: Range = {}): Promise<AccountBalance[]> {
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: {
          entry: {
            status: "POSTED",
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
    const balance = a.normalSide === "DEBIT" ? debit.minus(credit) : credit.minus(debit);
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
      where: { accountId, entry: { status: "POSTED", date: { lt: range.from } } },
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
        status: "POSTED",
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
