import Decimal from "decimal.js";
import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";
import { controlAccount } from "./control-accounts";

async function postedSum(accountId: string, range?: { from?: Date; to?: Date }) {
  const lines = await db.journalLine.findMany({
    where: {
      accountId,
      entry: {
        status: "POSTED",
        ...(range?.from || range?.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
      },
    },
    select: { debit: true, credit: true },
  });
  const d = lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
  const c = lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
  return { debit: d, credit: c };
}

export async function dashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [bank, cash, ar, ap, income, expense] = await Promise.all([
    controlAccount("BANK"),
    controlAccount("CASH"),
    controlAccount("AR"),
    controlAccount("AP"),
    controlAccount("INCOME_FEE"),
    db.account.findMany({ where: { associationId: DEFAULT_ASSOCIATION_ID, type: "EXPENSE" } }),
  ]);

  const [bankBal, cashBal, arBal, apBal, incomeMTD, expenseLines] = await Promise.all([
    postedSum(bank.id),
    postedSum(cash.id),
    postedSum(ar.id),
    postedSum(ap.id),
    postedSum(income.id, { from: monthStart }),
    Promise.all(expense.map((a) => postedSum(a.id, { from: monthStart }).then((r) => r.debit.minus(r.credit)))),
  ]);

  const cashOnHand = bankBal.debit.minus(bankBal.credit).plus(cashBal.debit).minus(cashBal.credit);
  const arOutstanding = arBal.debit.minus(arBal.credit);
  const apOutstanding = apBal.credit.minus(apBal.debit);
  const incomeMonth = incomeMTD.credit.minus(incomeMTD.debit);
  const expenseMonth = expenseLines.reduce((s, v) => s.plus(v), new Decimal(0));
  const netMonth = incomeMonth.minus(expenseMonth);

  const [topDebtors, recentReceipts, recentBills] = await Promise.all([
    db.resident.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      include: {
        charges: { where: { voided: false }, select: { amount: true, date: true } },
        receipts: { where: { voided: false }, select: { amount: true } },
      },
    }).then((rs) =>
      rs.map((r) => {
        const c = r.charges.reduce((s, x) => s.plus(new Decimal(x.amount.toString())), new Decimal(0));
        const p = r.receipts.reduce((s, x) => s.plus(new Decimal(x.amount.toString())), new Decimal(0));
        return { id: r.id, unitAddress: r.unitAddress, ownerName: r.ownerName, balance: c.minus(p) };
      })
        .filter((r) => r.balance.gt(0))
        .sort((a, b) => b.balance.cmp(a.balance))
        .slice(0, 5),
    ),
    db.receipt.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, voided: false },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      include: { resident: true },
    }),
    db.bill.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { date: "asc" },
      take: 5,
      include: { supplier: true },
    }),
  ]);

  return {
    cashOnHand,
    bankBalance: bankBal.debit.minus(bankBal.credit),
    cashInHand: cashBal.debit.minus(cashBal.credit),
    arOutstanding,
    apOutstanding,
    incomeMonth,
    expenseMonth,
    netMonth,
    topDebtors,
    recentReceipts,
    recentBills,
  };
}
