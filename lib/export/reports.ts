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

// ---------------------------------------------------------------------------
// Reports added alongside the Million parity work. Same shape as the ones above:
// build a ReportData and the PDF and Excel writers handle the rest.
// ---------------------------------------------------------------------------

export async function fixedAssets(r: Range): Promise<ReportData> {
  const asOf = r.to ? new Date(r.to) : new Date();
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, classifiedAs: { in: ["FA", "FD"] } },
    include: {
      lines: { where: { entry: { status: "POSTED", date: { lte: asOf } } }, select: { debit: true, credit: true } },
    },
    orderBy: { code: "asc" },
  });
  const bal = (a: (typeof accounts)[number]) =>
    a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())), new Decimal(0));

  const stem = (code: string) => code.split("/")[0];
  const depn = new Map(accounts.filter((a) => a.classifiedAs === "FD").map((d) => [stem(d.code), d]));

  let tc = new Decimal(0), td = new Decimal(0);
  const rows = accounts
    .filter((a) => a.classifiedAs === "FA")
    .map((a) => {
      const d = depn.get(stem(a.code));
      const cost = bal(a);
      const accum = d ? bal(d).negated() : new Decimal(0);
      return { a, cost, accum, nbv: cost.minus(accum), depnCode: d?.code ?? "" };
    })
    .filter((x) => !x.cost.isZero() || !x.accum.isZero())
    .map((x) => {
      tc = tc.plus(x.cost); td = td.plus(x.accum);
      return {
        code: x.a.code, name: x.a.name, depnCode: x.depnCode,
        cost: x.cost.toNumber(), accum: x.accum.toNumber(), nbv: x.nbv.toNumber(),
      };
    });

  return {
    ...(await base()),
    title: "Fixed Assets",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
    columns: [
      { key: "code", header: "A/C No.", width: 1.2 },
      { key: "name", header: "Asset", width: 3.5 },
      { key: "depnCode", header: "Depn A/C", width: 1.2 },
      numCol("cost", "Cost", 1.5),
      numCol("accum", "Accum. Depn", 1.5),
      numCol("nbv", "Net Book Value", 1.6),
    ],
    rows,
    totals: { code: "TOTAL", name: "", depnCode: "", cost: tc.toNumber(), accum: td.toNumber(), nbv: tc.minus(td).toNumber() },
  };
}

export async function invoiceListing(r: Range & { view?: string }): Promise<ReportData> {
  const view = r.view === "paid" ? "paid" : r.view === "due" ? "due" : "unpaid";
  const today = new Date();
  const charges = await db.charge.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, voided: false },
    include: {
      resident: { select: { debtorCode: true, unitAddress: true, ownerName: true } },
      allocations: { include: { receipt: { select: { voided: true } } } },
    },
    orderBy: [{ date: "asc" }],
  });

  let ta = new Decimal(0), tp = new Decimal(0), to = new Decimal(0);
  const rows = charges
    .map((c) => {
      const amount = new Decimal(c.amount.toString());
      const paid = c.allocations.filter((a) => !a.receipt.voided)
        .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const due = new Date(c.date.getTime() + 30 * 86400000);
      return { c, amount, paid, open: amount.minus(paid), due };
    })
    .filter((x) => view === "paid" ? x.open.lte(0)
      : view === "due" ? x.open.gt(0) && x.due.getTime() - today.getTime() <= 7 * 86400000
      : x.open.gt(0))
    .map((x) => {
      ta = ta.plus(x.amount); tp = tp.plus(x.paid); to = to.plus(x.open);
      return {
        date: x.c.date.toISOString().slice(0, 10),
        invoiceNo: x.c.invoiceNo ?? "",
        code: x.c.resident.debtorCode ?? "",
        unit: x.c.resident.unitAddress,
        owner: x.c.resident.ownerName,
        due: x.due.toISOString().slice(0, 10),
        amount: x.amount.toNumber(), paid: x.paid.toNumber(), open: x.open.toNumber(),
      };
    });

  return {
    ...(await base()),
    title: view === "paid" ? "Paid Invoices" : view === "due" ? "Invoices Payment Due" : "Unpaid Invoices",
    subtitle: `As of ${today.toISOString().slice(0, 10)}`,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "invoiceNo", header: "Invoice #", width: 1.3 },
      { key: "code", header: "Debtor A/C", width: 1.2 },
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      { key: "due", header: "Due", width: 1.2 },
      numCol("amount", "Amount", 1.3),
      numCol("paid", "Paid", 1.3),
      numCol("open", "Balance", 1.3),
    ],
    rows,
    totals: { date: "TOTAL", invoiceNo: "", code: "", unit: "", owner: "", due: "", amount: ta.toNumber(), paid: tp.toNumber(), open: to.toNumber() },
  };
}

export async function billListing(r: Range & { view?: string }): Promise<ReportData> {
  const view = r.view === "paid" ? "paid" : r.view === "due" ? "due" : "unpaid";
  const today = new Date();
  const bills = await db.bill.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      ...(view === "paid" ? { status: "PAID" as const } : { status: { in: ["UNPAID", "PARTIAL"] as const } }),
    },
    include: { supplier: true },
    orderBy: [{ dueDate: "asc" }, { date: "asc" }],
  });

  const filtered = view === "due"
    ? bills.filter((b) => b.dueDate && b.dueDate.getTime() - today.getTime() <= 7 * 86400000)
    : bills;

  let ta = new Decimal(0), tp = new Decimal(0);
  const rows = filtered.map((b) => {
    const amount = new Decimal(b.amount.toString());
    const paid = new Decimal(b.paid.toString());
    ta = ta.plus(amount); tp = tp.plus(paid);
    return {
      date: b.date.toISOString().slice(0, 10),
      invoiceNo: b.invoiceNo,
      supplier: b.supplier.name,
      due: b.dueDate ? b.dueDate.toISOString().slice(0, 10) : "",
      status: b.status,
      amount: amount.toNumber(), paid: paid.toNumber(), open: amount.minus(paid).toNumber(),
    };
  });

  return {
    ...(await base()),
    title: view === "paid" ? "Paid Bills" : view === "due" ? "Bills Payment Due" : "Unpaid Bills",
    subtitle: `As of ${today.toISOString().slice(0, 10)}`,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "invoiceNo", header: "Invoice #", width: 1.5 },
      { key: "supplier", header: "Supplier", width: 3 },
      { key: "due", header: "Due", width: 1.2 },
      { key: "status", header: "Status", width: 1 },
      numCol("amount", "Amount", 1.3),
      numCol("paid", "Paid", 1.3),
      numCol("open", "Balance", 1.3),
    ],
    rows,
    totals: { date: "TOTAL", invoiceNo: "", supplier: "", due: "", status: "", amount: ta.toNumber(), paid: tp.toNumber(), open: ta.minus(tp).toNumber() },
  };
}

export async function salesReport(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const charges = await db.charge.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID, voided: false, isOpeningBalance: false,
      ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
    },
    include: {
      resident: { select: { id: true, debtorCode: true, unitAddress: true, ownerName: true } },
      allocations: { include: { receipt: { select: { voided: true } } } },
    },
  });

  const acc = new Map<string, { code: string; unit: string; owner: string; count: number; billed: Decimal; settled: Decimal }>();
  for (const c of charges) {
    const e = acc.get(c.resident.id) ?? {
      code: c.resident.debtorCode ?? "", unit: c.resident.unitAddress, owner: c.resident.ownerName,
      count: 0, billed: new Decimal(0), settled: new Decimal(0),
    };
    e.count++;
    e.billed = e.billed.plus(new Decimal(c.amount.toString()));
    e.settled = e.settled.plus(c.allocations.filter((a) => !a.receipt.voided)
      .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0)));
    acc.set(c.resident.id, e);
  }

  let tb = new Decimal(0), ts = new Decimal(0);
  const rows = [...acc.values()].sort((a, b) => b.billed.comparedTo(a.billed)).map((e) => {
    tb = tb.plus(e.billed); ts = ts.plus(e.settled);
    return {
      code: e.code, unit: e.unit, owner: e.owner, count: e.count,
      billed: e.billed.toNumber(), settled: e.settled.toNumber(),
      open: e.billed.minus(e.settled).toNumber(),
    };
  });

  return {
    ...(await base()),
    title: "Debtors Sales Report",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "code", header: "Debtor A/C", width: 1.2 },
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      { key: "count", header: "Invoices", align: "right", width: 1 },
      numCol("billed", "Billed", 1.4),
      numCol("settled", "Settled", 1.4),
      numCol("open", "Outstanding", 1.4),
    ],
    rows,
    totals: { code: "TOTAL", unit: "", owner: "", count: "", billed: tb.toNumber(), settled: ts.toNumber(), open: tb.minus(ts).toNumber() },
  };
}

export async function creditorPayments(r: Range): Promise<ReportData> {
  const range = parseRange(r);
  const payments = await db.billPayment.findMany({
    where: {
      bill: { associationId: DEFAULT_ASSOCIATION_ID, status: { not: "VOIDED" } },
      ...(range.from || range.to ? { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {}),
    },
    include: { bill: { include: { supplier: true } } },
    orderBy: [{ date: "desc" }],
  });

  let total = new Decimal(0);
  const rows = payments.map((p) => {
    total = total.plus(new Decimal(p.amount.toString()));
    return {
      date: p.date.toISOString().slice(0, 10),
      supplier: p.bill.supplier.name,
      code: p.bill.supplier.creditorCode ?? "",
      invoiceNo: p.bill.invoiceNo,
      method: p.method,
      ref: p.bankRef ?? "",
      amount: Number(p.amount),
    };
  });

  return {
    ...(await base()),
    title: "Creditor Payments",
    subtitle: rangeSubtitle(r),
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "supplier", header: "Supplier", width: 3 },
      { key: "code", header: "Creditor A/C", width: 1.2 },
      { key: "invoiceNo", header: "Invoice", width: 1.5 },
      { key: "method", header: "Method", width: 1 },
      { key: "ref", header: "Reference", width: 1.5 },
      numCol("amount", "Amount", 1.4),
    ],
    rows,
    totals: { date: "TOTAL", supplier: "", code: "", invoiceNo: "", method: "", ref: "", amount: total.toNumber() },
  };
}

export async function accountRange(r: Range & { fromCode?: string; toCode?: string }): Promise<ReportData> {
  const asOf = r.to ? new Date(r.to) : new Date();
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    include: { lines: { where: { entry: { status: "POSTED", date: { lte: asOf } } }, select: { debit: true, credit: true } } },
    orderBy: { code: "asc" },
  });

  const rows = accounts
    .filter((a) => (!r.fromCode || a.code >= r.fromCode) && (!r.toCode || a.code <= r.toCode))
    .map((a) => {
      const dr = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
      const cr = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
      const raw = dr.minus(cr);
      return { a, balance: a.normalSide === "DEBIT" ? raw : raw.negated() };
    })
    .filter((x) => !x.balance.isZero())
    .map((x) => ({
      code: x.a.code, name: x.a.name, group: x.a.group, type: x.a.type,
      side: x.a.normalSide === "DEBIT" ? "Dr" : "Cr",
      balance: x.balance.toNumber(),
    }));

  return {
    ...(await base()),
    title: "Range of Accounts",
    subtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
    columns: [
      { key: "code", header: "A/C No.", width: 1.2 },
      { key: "name", header: "Description", width: 3.5 },
      { key: "group", header: "Group", width: 2 },
      { key: "type", header: "Type", width: 1.2 },
      { key: "side", header: "Side", width: 0.8 },
      numCol("balance", "Balance", 1.5),
    ],
    rows,
  };
}

export async function batchTransactions(r: { batch?: string }): Promise<ReportData> {
  if (!r.batch) throw new Error("batch is required for batch-transactions");
  const batch = await db.batch.findUnique({
    where: { associationId_batchNo: { associationId: DEFAULT_ASSOCIATION_ID, batchNo: r.batch } },
    include: {
      entries: {
        where: { status: "POSTED" },
        orderBy: [{ date: "asc" }, { entryNo: "asc" }],
        include: { lines: { include: { account: true }, orderBy: { lineNo: "asc" } } },
      },
    },
  });
  if (!batch) throw new Error(`Batch ${r.batch} not found`);

  let td = new Decimal(0), tc = new Decimal(0);
  const rows: Record<string, string | number | null>[] = [];
  for (const e of batch.entries) {
    for (const [i, l] of e.lines.entries()) {
      const d = new Decimal(l.debit.toString());
      const c = new Decimal(l.credit.toString());
      td = td.plus(d); tc = tc.plus(c);
      rows.push({
        date: i === 0 ? e.date.toISOString().slice(0, 10) : "",
        entryNo: i === 0 ? e.entryNo : "",
        code: l.account.code,
        description: i === 0 ? e.description : l.account.name,
        debit: d.isZero() ? "" : d.toNumber(),
        credit: c.isZero() ? "" : c.toNumber(),
      });
    }
  }

  return {
    ...(await base()),
    title: `Batch ${batch.batchNo}`,
    subtitle: batch.description,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "entryNo", header: "Entry #", width: 1.5 },
      { key: "code", header: "A/C No.", width: 1.2 },
      { key: "description", header: "Description", width: 4 },
      numCol("debit", "Debit", 1.4),
      numCol("credit", "Credit", 1.4),
    ],
    rows,
    totals: { date: "TOTAL", entryNo: "", code: "", description: "", debit: td.toNumber(), credit: tc.toNumber() },
  };
}
