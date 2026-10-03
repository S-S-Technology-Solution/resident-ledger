import Decimal from "decimal.js";
import { CashDirection } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { prepareEntry } from "./journal";
import { paymentMethodAccount } from "./control-accounts";
import { nextNumber, numberInUse } from "./numbering";
import { releaseLineFor } from "./bank-statement/service";

/**
 * Cash book — money in or out that has no debtor or creditor behind it. Bank
 * interest, a one-off contribution, a sundry payment. Posts straight against a GL
 * account, so it never touches the AR/AP control accounts.
 */

/** Numbering comes from the sequence settings — CR- for receipts, PV- for vouchers. */
export async function nextCashRefNo(
  direction: CashDirection,
  date: Date = new Date(),
  associationId = DEFAULT_ASSOCIATION_ID,
): Promise<string> {
  return nextNumber(direction === "IN" ? "CASH_IN" : "CASH_OUT", date, associationId);
}

export type CashLineInput = { accountId: string; description?: string; amount: string };

export type CashEntryInput = {
  direction: CashDirection;
  date: string;
  description: string;
  counterparty?: string;
  paymentFor?: string;
  method: string;
  bankRef?: string;
  chequeNo?: string;
  // The number from the voucher book; left out, the next in sequence is used.
  refNo?: string;
  // Several account lines (a voucher split across expenses), or the single
  // accountId/amount pair for a one-line entry.
  lines?: CashLineInput[];
  accountId?: string;
  amount?: string;
};

export async function createCashEntry(
  input: CashEntryInput,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const rawLines = input.lines?.length
    ? input.lines
    : input.accountId && input.amount ? [{ accountId: input.accountId, amount: input.amount, description: "" }] : [];
  if (!rawLines.length) throw new Error("Add at least one account line.");
  const lines = rawLines.map((l, i) => {
    const amount = new Decimal(l.amount || 0);
    if (amount.lte(0)) throw new Error(`Line ${i + 1}: the amount must be greater than zero.`);
    return { ...l, amount };
  });
  const amount = lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));

  const accounts = await db.account.findMany({ where: { id: { in: lines.map((l) => l.accountId) } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const [i, l] of lines.entries()) {
    const account = byId.get(l.accountId);
    if (!account) throw new Error(`Line ${i + 1}: pick an account.`);
    if (account.type === "ASSET" && account.code.startsWith("3300")) {
      throw new Error(`Line ${i + 1}: pick the income or expense account — the bank or cash side is set by the method.`);
    }
  }

  const date = new Date(input.date);
  const key = input.direction === "IN" ? "CASH_IN" : "CASH_OUT";
  let refNo = input.refNo?.replace(/\s+/g, "").toUpperCase();
  if (refNo) {
    if (await numberInUse(key, refNo, associationId)) {
      throw new Error(`${refNo} is already in the system. Check the number in the voucher book.`);
    }
  } else {
    refNo = await nextCashRefNo(input.direction, date, associationId);
  }
  const bankOrCash = await paymentMethodAccount(input.method === "CASH" ? "CASH" : "BANK");
  const { entryNo, batchId } = await prepareEntry(date, "cash");
  const isIn = input.direction === "IN";

  return db.$transaction(async (tx) => {
    const bankLine = { accountId: bankOrCash.id, debit: isIn ? amount.toFixed(2) : "0", credit: isIn ? "0" : amount.toFixed(2) };
    const accountLines = lines.map((l) => ({
      accountId: l.accountId,
      debit: isIn ? "0" : l.amount.toFixed(2),
      credit: isIn ? l.amount.toFixed(2) : "0",
      memo: l.description || null,
    }));
    const entry = await tx.journalEntry.create({
      data: {
        associationId,
        entryNo,
        batchId,
        date,
        description: input.description,
        reference: refNo,
        status: "POSTED",
        source: "cash",
        postedAt: new Date(),
        lines: {
          create: (isIn ? [bankLine, ...accountLines] : [...accountLines, bankLine]).map((l, i) => ({ ...l, lineNo: i + 1 })),
        },
      },
    });

    const cash = await tx.cashEntry.create({
      data: {
        associationId,
        refNo: refNo!,
        direction: input.direction,
        date,
        amount: amount.toFixed(2),
        description: input.description,
        counterparty: input.counterparty || null,
        paymentFor: input.paymentFor || null,
        method: input.method,
        bankRef: input.bankRef || null,
        chequeNo: input.chequeNo || null,
        accountId: lines[0].accountId,
        entryId: entry.id,
        lines: {
          create: lines.map((l, i) => ({
            lineNo: i + 1, accountId: l.accountId, description: l.description ?? "", amount: l.amount.toFixed(2),
          })),
        },
      },
    });

    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: cash.id } });
    return cash;
  });
}

export async function voidCashEntry(id: string, reason: string) {
  const cash = await db.cashEntry.findUnique({ where: { id } });
  if (!cash) throw new Error("Not found");
  if (cash.voided) throw new Error("Already voided");
  await releaseLineFor("cashEntry", id);

  const rev = await prepareEntry(new Date(), "reversal");

  await db.$transaction(async (tx) => {
    if (cash.entryId) {
      const entry = await tx.journalEntry.findUnique({
        where: { id: cash.entryId },
        include: { lines: true },
      });
      if (entry && entry.status === "POSTED") {
        await tx.journalEntry.create({
          data: {
            associationId: entry.associationId,
            entryNo: rev.entryNo,
            batchId: rev.batchId,
            date: new Date(),
            description: `Reversal of ${entry.entryNo}: ${reason}`,
            status: "POSTED",
            postedAt: new Date(),
            source: "reversal",
            reversesId: entry.id,
            lines: {
              create: entry.lines.map((l, i) => ({
                accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo, lineNo: i + 1,
              })),
            },
          },
        });
        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
        });
      }
    }
    await tx.cashEntry.update({ where: { id }, data: { voided: true, voidReason: reason } });
  });
}
