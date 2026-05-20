import Decimal from "decimal.js";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID, getAssociation } from "../association";
import { accountBalances, generalLedger } from "../reports";
import { ageingBucket } from "../ar";
import type { ReportData, Column } from "./types";

type Range = { from?: string; to?: string };

function parseRange(r: Range) {
  return {
    from: r.from ? new Date(r.from) : undefined,
    to: r.to ? new Date(r.to) : undefined,
  };
}

function rangeSubtitle(r: Range, asOf = false) {
  if (asOf) return `As of ${r.to ?? new Date().toISOString().slice(0, 10)}`;
  if (r.from && r.to) return `${r.from} to ${r.to}`;
  if (r.from) return `From ${r.from}`;
  if (r.to) return `Through ${r.to}`;
  return "All dates";
}

async function base(): Promise<Pick<ReportData, "associationName" | "generatedAt">> {
  const a = await getAssociation();
  return { associationName: a.name, generatedAt: new Date() };
}

const numCol = (key: string, header: string, width = 1): Column => ({ key, header, money: true, align: "right", width });

export async function trialBalance(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const accs = await accountBalances(range);
  const used = accs.filter((a) => !a.debit.eq(0) || !a.credit.eq(0));
  const totalD = used.reduce((s, a) => s.plus(a.debit), new Decimal(0));
  const totalC = used.reduce((s, a) => s.plus(a.credit), new Decimal(0));
  return {
    ...(await base()),
    title: "Trial Balance",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "code", header: "Code", width: 1 },
      { key: "name", header: "Account", width: 4 },
      numCol("debit", "Debit", 2),
      numCol("credit", "Credit", 2),
    ],
    rows: used.map((a) => ({
      code: a.code,
      name: a.name,
      debit: a.debit.gt(0) ? a.debit.toNumber() : "",
      credit: a.credit.gt(0) ? a.credit.toNumber() : "",
    })),
    totals: { code: "", name: "TOTAL", debit: totalD.toNumber(), credit: totalC.toNumber() },
  };
}

export async function profitLoss(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const accs = await accountBalances(range);
  const income = accs.filter((a) => a.type === "INCOME" && !a.balance.eq(0));
  const expense = accs.filter((a) => a.type === "EXPENSE" && !a.balance.eq(0));
  const totalIncome = income.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalExpense = expense.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const net = totalIncome.minus(totalExpense);

  const rows: ReportData["rows"] = [];
  rows.push({ section: "Income", account: "", amount: "" });
  for (const a of income) rows.push({ section: "", account: `  ${a.code} — ${a.name}`, amount: a.balance.toNumber() });
  rows.push({ section: "Total Income", account: "", amount: totalIncome.toNumber() });
  rows.push({ section: "Expense", account: "", amount: "" });
  for (const a of expense) rows.push({ section: "", account: `  ${a.code} — ${a.name}`, amount: a.balance.toNumber() });
  rows.push({ section: "Total Expense", account: "", amount: totalExpense.toNumber() });

  return {
    ...(await base()),
    title: "Profit and Loss",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "section", header: "Section", width: 2 },
      { key: "account", header: "Account", width: 4 },
      numCol("amount", "Amount", 2),
    ],
    rows,
    totals: { section: "Net Income", account: "", amount: net.toNumber() },
  };
}

export async function balanceSheet(r: Range): Promise<ReportData> {
  const asOf = r.to ? new Date(r.to) : new Date();
  const accs = await accountBalances({ to: asOf });
  const assets = accs.filter((a) => a.type === "ASSET" && !a.balance.eq(0));
  const liabilities = accs.filter((a) => a.type === "LIABILITY" && !a.balance.eq(0));
  const equity = accs.filter((a) => a.type === "EQUITY" && !a.balance.eq(0));
  const income = accs.filter((a) => a.type === "INCOME");
  const expense = accs.filter((a) => a.type === "EXPENSE");
  const netIncome = income.reduce((s, a) => s.plus(a.balance), new Decimal(0))
    .minus(expense.reduce((s, a) => s.plus(a.balance), new Decimal(0)));
  const totalAssets = assets.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalLiab = liabilities.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalEquity = equity.reduce((s, a) => s.plus(a.balance), new Decimal(0)).plus(netIncome);

  const rows: ReportData["rows"] = [];
  const push = (heading: string, list: typeof accs) => {
    rows.push({ section: heading, account: "", amount: "" });
    for (const a of list) rows.push({ section: "", account: `  ${a.code} — ${a.name}`, amount: a.balance.toNumber() });
  };
  push("Assets", assets);
  rows.push({ section: "Total Assets", account: "", amount: totalAssets.toNumber() });
  push("Liabilities", liabilities);
  rows.push({ section: "Total Liabilities", account: "", amount: totalLiab.toNumber() });
  push("Equity", equity);
  rows.push({ section: "", account: "  Net Income (period to date)", amount: netIncome.toNumber() });
  rows.push({ section: "Total Equity", account: "", amount: totalEquity.toNumber() });

  return {
    ...(await base()),
    title: "Balance Sheet",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
    columns: [
      { key: "section", header: "Section", width: 2 },
      { key: "account", header: "Account", width: 4 },
      numCol("amount", "Amount", 2),
    ],
    rows,
    totals: { section: "Total Liabilities & Equity", account: "", amount: totalLiab.plus(totalEquity).toNumber() },
  };
}

export async function generalLedgerReport(accountId: string, r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const { account, opening, rows: lines, closing } = await generalLedger(accountId, range);
  return {
    ...(await base()),
    title: `General Ledger — ${account.code} ${account.name}`,
    subtitle: rangeSubtitle(r) + ` · Opening ${opening.toFixed(2)}`,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "entryNo", header: "Entry #", width: 1.5 },
      { key: "description", header: "Description", width: 4 },
      numCol("debit", "Debit", 1.5),
      numCol("credit", "Credit", 1.5),
      numCol("balance", "Balance", 1.5),
    ],
    rows: lines.map((l) => ({
      date: l.date.toISOString().slice(0, 10),
      entryNo: l.entryNo,
      description: l.description + (l.memo ? ` — ${l.memo}` : ""),
      debit: l.debit.gt(0) ? l.debit.toNumber() : "",
      credit: l.credit.gt(0) ? l.credit.toNumber() : "",
      balance: l.balance.toNumber(),
    })),
    totals: { date: "", entryNo: "", description: "Closing balance", debit: "", credit: "", balance: closing.toNumber() },
  };
}

export async function arAgeing(r: Range): Promise<ReportData> {
  const asOf = r.to ? new Date(r.to) : new Date();
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    include: {
      charges: { where: { voided: false, date: { lte: asOf } }, include: { allocations: { include: { receipt: true } } } },
      receipts: { where: { voided: false, date: { lte: asOf } }, include: { allocations: true } },
    },
  });

  const rows: ReportData["rows"] = [];
  const totals = { current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0), d61_90: new Decimal(0), d90p: new Decimal(0), total: new Decimal(0) };

  for (const res of residents) {
    const b = { current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0), d61_90: new Decimal(0), d90p: new Decimal(0) };
    for (const c of res.charges) {
      const allocated = c.allocations
        .filter((a) => !a.receipt.voided && a.receipt.date <= asOf)
        .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const open = new Decimal(c.amount.toString()).minus(allocated);
      if (open.eq(0)) continue;
      const bucket = ageingBucket(c.date, asOf);
      b[bucket] = b[bucket].plus(open);
    }
    for (const p of res.receipts) {
      const total = new Decimal(p.amount.toString());
      const allocated = p.allocations.reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const unapplied = total.minus(allocated);
      if (unapplied.gt(0)) b.current = b.current.minus(unapplied);
    }
    const tot = b.current.plus(b.d1_30).plus(b.d31_60).plus(b.d61_90).plus(b.d90p);
    if (tot.eq(0)) continue;
    rows.push({
      unit: res.unitAddress,
      owner: res.ownerName,
      current: b.current.toNumber(),
      d1_30: b.d1_30.toNumber(),
      d31_60: b.d31_60.toNumber(),
      d61_90: b.d61_90.toNumber(),
      d90p: b.d90p.toNumber(),
      total: tot.toNumber(),
    });
    totals.current = totals.current.plus(b.current);
    totals.d1_30 = totals.d1_30.plus(b.d1_30);
    totals.d31_60 = totals.d31_60.plus(b.d31_60);
    totals.d61_90 = totals.d61_90.plus(b.d61_90);
    totals.d90p = totals.d90p.plus(b.d90p);
    totals.total = totals.total.plus(tot);
  }

  return {
    ...(await base()),
    title: "A/R Ageing Summary",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
    columns: [
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      numCol("current", "Current", 1.3),
      numCol("d1_30", "1 – 30", 1.3),
      numCol("d31_60", "31 – 60", 1.3),
      numCol("d61_90", "61 – 90", 1.3),
      numCol("d90p", "> 90", 1.3),
      numCol("total", "Total", 1.5),
    ],
    rows,
    totals: {
      unit: "TOTAL", owner: "",
      current: totals.current.toNumber(), d1_30: totals.d1_30.toNumber(),
      d31_60: totals.d31_60.toNumber(), d61_90: totals.d61_90.toNumber(),
      d90p: totals.d90p.toNumber(), total: totals.total.toNumber(),
    },
  };
}

export async function collectionReport(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const dateRange = (range.from || range.to) ? {
    ...(range.from && { gte: range.from }),
    ...(range.to && { lte: range.to }),
  } : undefined;

  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    include: {
      charges: { where: { voided: false, ...(dateRange ? { date: dateRange } : {}) } },
      receipts: { where: { voided: false, ...(dateRange ? { date: dateRange } : {}) } },
    },
  });
  const rows = residents.map((res) => {
    const billed = res.charges.reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0));
    const collected = res.receipts.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    return {
      unit: res.unitAddress,
      owner: res.ownerName,
      billed: billed.toNumber(),
      collected: collected.toNumber(),
      net: billed.minus(collected).toNumber(),
    };
  }).filter((x) => x.billed !== 0 || x.collected !== 0);

  const totals = rows.reduce(
    (s, r2) => ({ billed: s.billed + r2.billed, collected: s.collected + r2.collected, net: s.net + r2.net }),
    { billed: 0, collected: 0, net: 0 },
  );
  return {
    ...(await base()),
    title: "Collection Report",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      numCol("billed", "Billed", 1.5),
      numCol("collected", "Collected", 1.5),
      numCol("net", "Net", 1.5),
    ],
    rows,
    totals: { unit: "TOTAL", owner: "", ...totals },
  };
}

export async function apAgeing(r: Range): Promise<ReportData> {
  const asOf = r.to ? new Date(r.to) : new Date();
  const bills = await db.bill.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, status: { not: "VOIDED" }, date: { lte: asOf } },
    include: { supplier: true, payments: { where: { date: { lte: asOf } } } },
    orderBy: [{ supplier: { name: "asc" } }, { date: "asc" }],
  });
  const rows: ReportData["rows"] = [];
  let total = new Decimal(0);
  for (const b of bills) {
    const paid = b.payments.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    const open = new Decimal(b.amount.toString()).minus(paid);
    if (open.lte(0)) continue;
    const days = Math.floor((asOf.getTime() - b.date.getTime()) / 86400000);
    const bucket = days <= 0 ? "Current" : days <= 30 ? "1 – 30" : days <= 60 ? "31 – 60" : days <= 90 ? "61 – 90" : "> 90";
    rows.push({
      supplier: b.supplier.name,
      invoiceNo: b.invoiceNo,
      date: b.date.toISOString().slice(0, 10),
      open: open.toNumber(),
      bucket,
    });
    total = total.plus(open);
  }
  return {
    ...(await base()),
    title: "A/P Ageing",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
    columns: [
      { key: "supplier", header: "Supplier", width: 3 },
      { key: "invoiceNo", header: "Invoice #", width: 1.5 },
      { key: "date", header: "Date", width: 1.2 },
      numCol("open", "Open", 1.5),
      { key: "bucket", header: "Bucket", width: 1.5, align: "right" },
    ],
    rows,
    totals: { supplier: "TOTAL", invoiceNo: "", date: "", open: total.toNumber(), bucket: "" },
  };
}

export async function expenseByCategory(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const accs = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, type: "EXPENSE" },
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: {
          entry: {
            status: "POSTED",
            ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
          },
        },
        select: { debit: true, credit: true },
      },
    },
  });
  const rows = accs.map((a) => {
    const d = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
    const c = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
    return { code: a.code, name: a.name, amount: d.minus(c) };
  }).filter((x) => !x.amount.eq(0));
  const total = rows.reduce((s, x) => s.plus(x.amount), new Decimal(0));
  return {
    ...(await base()),
    title: "Expense by Category",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "code", header: "Code", width: 1 },
      { key: "name", header: "Category", width: 4 },
      numCol("amount", "Amount", 2),
    ],
    rows: rows.map((x) => ({ code: x.code, name: x.name, amount: x.amount.toNumber() })),
    totals: { code: "", name: "TOTAL", amount: total.toNumber() },
  };
}

export async function paymentHistory(residentId: string, r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const resident = await db.resident.findUnique({ where: { id: residentId } });
  if (!resident) throw new Error("Resident not found");
  const receipts = await db.receipt.findMany({
    where: {
      residentId,
      ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
    },
    orderBy: { date: "asc" },
    include: { allocations: { include: { charge: true } } },
  });
  let total = new Decimal(0);
  const rows: ReportData["rows"] = receipts.map((rc) => {
    const amt = new Decimal(rc.amount.toString());
    if (!rc.voided) total = total.plus(amt);
    const applied = rc.allocations.length === 0
      ? "Unapplied"
      : rc.allocations.map((a) => `${a.charge.periodYear}-${String(a.charge.periodMonth).padStart(2, "0")}`).join(", ");
    return {
      date: rc.date.toISOString().slice(0, 10),
      receiptNo: rc.receiptNo,
      method: rc.method,
      bankRef: rc.bankRef ?? "",
      applied,
      amount: amt.toNumber(),
      status: rc.voided ? "VOIDED" : "POSTED",
    };
  });
  return {
    ...(await base()),
    title: "Payment History",
    subtitle: `${resident.unitAddress} · ${resident.ownerName} · ${rangeSubtitle(r)}`,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "receiptNo", header: "Receipt #", width: 1.5 },
      { key: "method", header: "Method", width: 1 },
      { key: "bankRef", header: "Bank Ref", width: 1.5 },
      { key: "applied", header: "Applied To", width: 2.5 },
      numCol("amount", "Amount", 1.5),
      { key: "status", header: "Status", width: 1, align: "right" },
    ],
    rows,
    totals: { date: "", receiptNo: "", method: "", bankRef: "", applied: "Net paid in period", amount: total.toNumber(), status: "" },
  };
}

export async function expenseBySupplier(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const bills = await db.bill.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      status: { not: "VOIDED" },
      ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
    },
    include: { supplier: true },
  });
  const map = new Map<string, { name: string; total: Decimal; count: number }>();
  for (const b of bills) {
    const e = map.get(b.supplierId) ?? { name: b.supplier.name, total: new Decimal(0), count: 0 };
    e.total = e.total.plus(new Decimal(b.amount.toString()));
    e.count += 1;
    map.set(b.supplierId, e);
  }
  const sorted = [...map.values()].sort((a, b) => b.total.cmp(a.total));
  const total = sorted.reduce((s, x) => s.plus(x.total), new Decimal(0));
  return {
    ...(await base()),
    title: "Expense by Supplier",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "name", header: "Supplier", width: 4 },
      { key: "count", header: "Bills", width: 1, align: "right" },
      numCol("total", "Total", 2),
    ],
    rows: sorted.map((x) => ({ name: x.name, count: x.count, total: x.total.toNumber() })),
    totals: { name: "TOTAL", count: "", total: total.toNumber() },
  };
}
