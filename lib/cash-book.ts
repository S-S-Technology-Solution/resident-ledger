import Decimal from "decimal.js";
import { CashDirection } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { prepareEntry } from "./journal";
import { paymentMethodAccount } from "./control-accounts";
import { nextNumber } from "./numbering";

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
  return nextNumber(direction === "IN" ? "CASH_IN" : "CASH_OUT", date, async (stem) => {
    const last = await db.cashEntry.findFirst({
      where: { associationId, refNo: { startsWith: stem } },
      orderBy: { refNo: "desc" },
      select: { refNo: true },
    });
    return last?.refNo ?? null;
  }, associationId);
}

export type CashEntryInput = {
  direction: CashDirection;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  counterparty?: string;
  method: string;
  bankRef?: string;
  chequeNo?: string;
};

export async function createCashEntry(
  input: CashEntryInput,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const amount = new Decimal(input.amount);
  if (amount.lte(0)) throw new Error("Amount must be greater than zero");

  const account = await db.account.findUnique({ where: { id: input.accountId } });
  if (!account) throw new Error("Account not found");
  if (account.type === "ASSET" && account.code.startsWith("3300")) {
    throw new Error("Pick the income or expense account — the bank or cash side is set by the method.");
  }

  const date = new Date(input.date);
  const bankOrCash = await paymentMethodAccount(input.method === "CASH" ? "CASH" : "BANK");
  const { entryNo, batchId } = await prepareEntry(date, "cash");
  const refNo = await nextCashRefNo(input.direction, date, associationId);
  const isIn = input.direction === "IN";

  return db.$transaction(async (tx) => {
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
          create: isIn
            ? [
                { accountId: bankOrCash.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
                { accountId: account.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
              ]
            : [
                { accountId: account.id, debit: amount.toFixed(2), credit: "0", lineNo: 1 },
                { accountId: bankOrCash.id, debit: "0", credit: amount.toFixed(2), lineNo: 2 },
              ],
        },
      },
    });

    const cash = await tx.cashEntry.create({
      data: {
        associationId,
        refNo,
        direction: input.direction,
        date,
        amount: amount.toFixed(2),
        description: input.description,
        counterparty: input.counterparty || null,
        method: input.method,
        bankRef: input.bankRef || null,
        chequeNo: input.chequeNo || null,
        accountId: account.id,
        entryId: entry.id,
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
