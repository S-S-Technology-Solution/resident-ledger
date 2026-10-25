import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "../db";
import { listAudit } from "../audit";
import { auditDetail, cashBook, cashFlow, findTransactions, remittancePayments, type TransactionSearch } from "../report-queries";
import {
  creditorLedger, debtorLedger, twelveMonthSummary, twelveMonthTotal, MONTHS, TWELVE_MONTH_ROWS, type LedgerRow,
} from "../subsidiary-ledger";
import type { ExportDef, ReportData } from "./types";
import { base, numCol, parseRange, rangeSubtitle, ymd, type Range } from "./helpers";

/**
 * Exports for the remaining report pages. Each builds from the same query the
 * page calls (lib/report-queries, lib/subsidiary-ledger), so a download shows
 * what is on screen — every matching row, not just the first page of them.
 */

const opt = (sp: URLSearchParams, k: string) => sp.get(k) || undefined;
const range = (sp: URLSearchParams): Range => ({ from: opt(sp, "from"), to: opt(sp, "to") });
const money = (v: Decimal) => (v.gt(0) ? v.toNumber() : "");

/** Voids, deletions, opening balances and year-end closings, newest first. */
export async function auditTrail(): Promise<ReportData> {
  // The screen lists the latest 200; the download has the whole log.
  const entries = await listAudit(100_000);
  return {
    ...(await base()),
    title: "Audit Trail",
    subtitle: "Voids, deletions, opening balances and year-end closings",
    landscape: true,
    columns: [
      { key: "when", header: "When", width: 1.4 },
      { key: "who", header: "Who", width: 1.2 },
      { key: "entity", header: "What", width: 1.2 },
      { key: "action", header: "Action", width: 0.9 },
      { key: "detail", header: "Detail", width: 6 },
    ],
    rows: entries.map((e) => ({
      when: format(e.createdAt, "yyyy-MM-dd HH:mm"),
      who: e.userName,
      entity: e.entity,
      action: e.action,
      detail: auditDetail(e),
    })),
  };
}

/** Bank or cash book: balance b/f, each movement with payee and running balance, period totals. */
export async function cashBookReport(r: Range & { account?: string }): Promise<ReportData> {
  const cb = await cashBook(r);
  const rows: ReportData["rows"] = [
    { date: format(cb.fromDate, "yyyy-MM-dd"), voucher: "", payee: "", description: "Balance brought forward", debit: "", credit: "", balance: cb.opening.toNumber() },
  ];
  for (const x of cb.rows) {
    rows.push({
      date: ymd(x.date), voucher: x.voucher, payee: x.payee, description: x.description,
      debit: money(x.debit), credit: money(x.credit), balance: x.balance.toNumber(),
    });
  }
  if (cb.rows.length === 0) {
    rows.push({ __style: "muted", date: "", voucher: "", payee: "", description: "No movements on this account in the selected period.", debit: "", credit: "", balance: "" });
  }
  return {
    ...(await base()),
    title: `Cash Book — ${cb.accountLabel}`,
    subtitle: `${format(cb.fromDate, "yyyy-MM-dd")} to ${format(cb.toDate, "yyyy-MM-dd")}`,
    landscape: true,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "voucher", header: "Voucher #", width: 1.3 },
      { key: "payee", header: "Payee / From", width: 2.8 },
      { key: "description", header: "Description", width: 3.2 },
      numCol("debit", "Receipt (In)", 1.4),
      numCol("credit", "Payment (Out)", 1.4),
      numCol("balance", "Balance", 1.5),
    ],
    rows,
    totals: {
      date: "", voucher: "", payee: "", description: "Period totals",
      debit: cb.totalIn.toNumber(), credit: cb.totalOut.toNumber(), balance: cb.closing.toNumber(),
    },
  };
}

/** Cash at start, received and paid out by counter-account, net movement, cash at end. */
export async function cashFlowReport(r: Range): Promise<ReportData> {
  const cf = await cashFlow(r);
  const rows: ReportData["rows"] = [
    { __style: "total", code: "", name: "Cash at start of period", amount: cf.opening.toNumber() },
    { __style: "heading", code: "", name: "Cash received", amount: "" },
    ...cf.inflows.map((x) => ({ code: x.code, name: x.name, amount: x.inflow.minus(x.outflow).toNumber() })),
  ];
  if (cf.inflows.length === 0) rows.push({ __style: "muted", code: "", name: "Nothing received in this period", amount: "" });
  rows.push({ __style: "heading", code: "", name: "Cash paid out", amount: "" });
  // Paid out shows negative, which Excel prints in brackets as the page does.
  for (const x of cf.outflows) rows.push({ code: x.code, name: x.name, amount: x.inflow.minus(x.outflow).toNumber() });
  if (cf.outflows.length === 0) rows.push({ __style: "muted", code: "", name: "Nothing paid out in this period", amount: "" });
  rows.push({ __style: "total", code: "", name: "Net movement in cash", amount: cf.movement.toNumber() });

  return {
    ...(await base()),
    title: "Cash Flow Statement",
    subtitle: cf.fromDate
      ? `${format(cf.fromDate, "yyyy-MM-dd")} to ${format(cf.toDate, "yyyy-MM-dd")}`
      : `Up to ${format(cf.toDate, "yyyy-MM-dd")}`,
    columns: [
      { key: "code", header: "A/C No.", width: 1.2 },
      { key: "name", header: "Source of movement", width: 4.5 },
      numCol("amount", "Amount", 1.8),
    ],
    rows,
    totals: { code: "", name: "Cash at end of period", amount: cf.closing.toNumber() },
  };
}

/** Every journal entry matching the transaction enquiry. */
export async function checkTransaction(s: TransactionSearch): Promise<ReportData> {
  const entries = await findTransactions(s);
  const filters = [
    s.q && `"${s.q}"`,
    s.amount && `amount ${s.amount}`,
    (s.from || s.to) && rangeSubtitle(s),
    s.status,
  ].filter(Boolean).join(" · ");
  return {
    ...(await base()),
    title: "Check Transaction",
    subtitle: filters || "No search entered",
    landscape: true,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "entryNo", header: "Entry #", width: 1.4 },
      { key: "batch", header: "Batch", width: 0.9 },
      { key: "description", header: "Description", width: 4 },
      { key: "accounts", header: "Accounts", width: 2 },
      { key: "status", header: "Status", width: 1 },
      numCol("amount", "Amount", 1.4),
    ],
    rows: entries.map((e) => ({
      ...(e.status === "VOIDED" ? { __style: "muted" as const } : {}),
      date: ymd(e.date),
      entryNo: e.entryNo,
      batch: e.batch?.batchNo ?? "",
      description: e.reference ? `${e.description} · ${e.reference}` : e.description,
      accounts: e.lines.map((l) => l.account.code).join(" / "),
      status: e.status,
      amount: e.total.toNumber(),
    })),
    totals: {
      date: `${entries.length} ${entries.length === 1 ? "match" : "matches"}`,
      entryNo: "", batch: "", description: "", accounts: "", status: "", amount: "",
    },
  };
}

/** One resident's or supplier's ledger: opening balance, each invoice and payment, closing balance. */
export async function subsidiaryLedger(r: Range & { kind?: string; id?: string }): Promise<ReportData> {
  if (!r.id) throw new Error("id is required for debtor-ledger");
  const kind = r.kind === "creditor" ? "creditor" : "debtor";
  const dates = parseRange(r);
  const debtor = kind === "debtor" ? await debtorLedger(r.id, dates) : null;
  const creditor = kind === "creditor" ? await creditorLedger(r.id, dates) : null;
  const data = debtor ?? creditor;
  if (!data) throw new Error(kind === "debtor" ? "Resident not found" : "Supplier not found");

  const heading = debtor
    ? `${debtor.resident.debtorCode ?? ""} ${debtor.resident.unitAddress} — ${debtor.resident.ownerName}`.trim()
    : `${creditor!.supplier.creditorCode ?? ""} ${creditor!.supplier.name}`.trim();
  const blank = { date: "", ref: "", debit: "", credit: "" };
  const rows: ReportData["rows"] = [{ ...blank, __style: "muted", description: "Opening balance", balance: data.opening.toNumber() }];
  for (const x of data.rows) {
    rows.push({ date: ymd(x.date), ref: x.ref, description: x.description, debit: money(x.debit), credit: money(x.credit), balance: x.balance.toNumber() });
  }
  if (data.rows.length === 0) {
    rows.push({ ...blank, __style: "muted", description: "Nothing was posted to this account in the selected period.", balance: "" });
  }
  const sum = (f: (x: LedgerRow) => Decimal) => data.rows.reduce((s, x) => s.plus(f(x)), new Decimal(0));

  return {
    ...(await base()),
    title: kind === "debtor" ? "Debtor Ledger" : "Creditor Ledger",
    subtitle: `${heading} · ${rangeSubtitle(r)}`,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "ref", header: "Reference", width: 1.4 },
      { key: "description", header: "Description", width: 3.2 },
      // Debtors: invoices are the debit side. Creditors: payments are.
      numCol("debit", kind === "debtor" ? "Invoice" : "Payment", 1.3),
      numCol("credit", kind === "debtor" ? "Payment" : "Invoice", 1.3),
      numCol("balance", "Balance", 1.4),
    ],
    rows,
    totals: {
      date: "", ref: "", description: "Closing balance",
      debit: sum((x) => x.debit).toNumber(), credit: sum((x) => x.credit).toNumber(), balance: data.closing.toNumber(),
    },
  };
}

/** Payments made to one supplier and the invoices they settled, to send to the supplier. */
export async function remittanceAdvice(r: Range & { supplierId?: string }): Promise<ReportData> {
  if (!r.supplierId) throw new Error("supplierId is required for remittance-advice");
  const supplier = await db.supplier.findUnique({ where: { id: r.supplierId } });
  if (!supplier) throw new Error("Supplier not found");
  const { payments, total } = await remittancePayments(supplier.id, r);
  return {
    ...(await base()),
    title: "Remittance Advice",
    subtitle: `To ${supplier.name}${supplier.creditorCode ? ` (${supplier.creditorCode})` : ""} · ${rangeSubtitle(r)}`,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "invoiceNo", header: "Invoice", width: 2 },
      { key: "method", header: "Method", width: 1.2 },
      { key: "ref", header: "Reference", width: 1.8 },
      numCol("amount", "Amount", 1.4),
    ],
    rows: payments.map((p) => ({
      date: ymd(p.date), invoiceNo: p.bill.invoiceNo, method: p.method, ref: p.bankRef ?? "",
      amount: new Decimal(p.amount.toString()).toNumber(),
    })),
    totals: { date: "", invoiceNo: "Total remitted", method: "", ref: "", amount: total.toNumber() },
    signatures: ["Treasurer"],
  };
}

/** Sales, purchases, receipts, payments, expenses and the cash balance, month by month. */
export async function twelveMonth(r: { year?: string }): Promise<ReportData> {
  const year = r.year ? Number(r.year) : new Date().getFullYear();
  const summary = await twelveMonthSummary(year);
  const monthKeys = MONTHS.map((m) => m.toLowerCase());
  return {
    ...(await base()),
    title: "12-Month Transaction Summary",
    subtitle: `Month by month through ${year} · cash & bank balance is at each month end, so its total is the year-end balance`,
    landscape: true,
    columns: [
      { key: "label", header: "", width: 2.2 },
      ...MONTHS.map((m, i) => numCol(monthKeys[i], m, 1)),
      numCol("total", "Total", 1.2),
    ],
    rows: TWELVE_MONTH_ROWS.map((row) => {
      const values = summary[row.key];
      return {
        ...(row.emphasis ? { __style: "total" as const } : {}),
        label: row.label,
        ...Object.fromEntries(values.map((v, i) => [monthKeys[i], v.isZero() ? "" : v.toNumber()])),
        total: twelveMonthTotal(row.key, values).toNumber(),
      };
    }),
  };
}

export const MORE_REPORT_EXPORTS: Record<string, ExportDef> = {
  "audit-trail": { screen: "reports", build: () => auditTrail() },
  "cash-book": { screen: "reports", build: (sp) => cashBookReport({ ...range(sp), account: opt(sp, "account") }) },
  "cash-flow": { screen: "reports", build: (sp) => cashFlowReport(range(sp)) },
  "check-transaction": {
    screen: "reports",
    build: (sp) => checkTransaction({ ...range(sp), q: opt(sp, "q"), amount: opt(sp, "amount"), status: opt(sp, "status") }),
  },
  "debtor-ledger": {
    screen: "reports",
    build: (sp) => subsidiaryLedger({ ...range(sp), kind: opt(sp, "kind"), id: opt(sp, "id") }),
  },
  "remittance-advice": {
    screen: "reports",
    build: (sp) => remittanceAdvice({ ...range(sp), supplierId: opt(sp, "supplierId") }),
  },
  "twelve-month": { screen: "reports", build: (sp) => twelveMonth({ year: opt(sp, "year") }) },
};
