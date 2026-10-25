import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { residentBalances } from "../ar";
import { supplierBalances } from "../ap";
import { GROUP_LABEL } from "../batches";
import { draftKindLabel } from "../draft-labels";
import {
  filterResidents, chargeWhere, CHARGE_ORDER, receiptWhere, RECEIPT_ORDER, billWhere, BILL_ORDER,
  accountWhere, acTypeLabel, CASH_BOOK_ORDER, journalWhere, JOURNAL_ORDER, batchQuery, type ListFilter,
} from "../list-filters";
import { residentStatement } from "../resident-statement";
import { amountInWords } from "../receipts";
import type { ExportDef, ReportData } from "./types";
import { base, numCol, rangeSubtitle, ymd } from "./helpers";

/**
 * Exports for the main list screens. Each takes the screen's own filters from
 * the query string and returns every matching row, not just the page on screen.
 */
const opt = (sp: URLSearchParams, k: string) => sp.get(k) || undefined;
const filters = (sp: URLSearchParams): ListFilter => ({
  q: opt(sp, "q"), from: opt(sp, "from"), to: opt(sp, "to"), status: opt(sp, "status"),
});
const dec = (v: { toString(): string }) => new Decimal(v.toString());

/** "2026-01-01 to 2026-01-31 · Search "jalan" · PAID" — what the screen was filtered by. */
function filterSubtitle(f: ListFilter, dates = true) {
  return [
    dates ? rangeSubtitle(f) : null,
    f.q ? `Search "${f.q}"` : null,
    f.status ?? null,
  ].filter(Boolean).join(" · ") || "All";
}

async function residents(sp: URLSearchParams): Promise<ReportData> {
  const q = opt(sp, "q");
  const [all, phones] = await Promise.all([
    residentBalances(),
    db.resident.findMany({ where: { associationId: DEFAULT_ASSOCIATION_ID }, select: { id: true, phone: true } }),
  ]);
  const phone = new Map(phones.map((p) => [p.id, p.phone]));
  const rows = filterResidents(all, q);
  return {
    ...(await base()),
    title: "Residents",
    subtitle: `${q ? `Search "${q}" · ` : ""}${rows.length} of ${all.length}`,
    columns: [
      { key: "code", header: "Debtor A/C", width: 1.2 },
      { key: "unit", header: "Unit", width: 2.5 },
      { key: "owner", header: "Owner", width: 3 },
      { key: "phone", header: "Phone", width: 1.5 },
      numCol("fee", "Monthly Fee", 1.2),
      numCol("balance", "Balance", 1.3),
      { key: "status", header: "Status", width: 1 },
    ],
    rows: rows.map((r) => ({
      code: r.debtorCode ?? "",
      unit: r.unitAddress,
      owner: r.ownerName,
      phone: phone.get(r.id) ?? "",
      fee: r.monthlyFee.toNumber(),
      balance: r.balance.toNumber(),
      status: r.active ? "Active" : "Moved out",
    })),
    totals: {
      code: "TOTAL",
      fee: rows.reduce((s, r) => s.plus(r.monthlyFee), new Decimal(0)).toNumber(),
      balance: rows.reduce((s, r) => s.plus(r.balance), new Decimal(0)).toNumber(),
    },
  };
}

async function residentStatementExport(sp: URLSearchParams): Promise<ReportData> {
  const residentId = sp.get("residentId");
  if (!residentId) throw new Error("residentId is required for resident-statement");
  const st = await residentStatement(residentId, { from: opt(sp, "from"), to: opt(sp, "to") });
  if (!st) throw new Error("Resident not found");
  // Same layout as the on-screen statement: b/f, running balance, closing, then ageing.
  const { resident, fromDate, toDate, opening, rows, closing, ageing, ageingTotal } = st;
  // The period ends are server-local (start of this month, end of the day), as on screen.
  const localYmd = (d: Date) => format(d, "yyyy-MM-dd");
  const money = (v: Decimal) => (v.gt(0) ? v.toNumber() : "");
  return {
    ...(await base()),
    title: "Statement of Account",
    subtitle: `${resident.debtorCode ? `${resident.debtorCode} · ` : ""}${resident.unitAddress} · ${resident.ownerName} · ${localYmd(fromDate)} to ${localYmd(toDate)}`,
    columns: [
      { key: "date", header: "Date", width: 1.2 },
      { key: "ref", header: "Ref No.", width: 1.2 },
      { key: "description", header: "Description", width: 4 },
      numCol("debit", "Debit", 1.3),
      numCol("credit", "Credit", 1.3),
      numCol("balance", "Balance", 1.4),
    ],
    rows: [
      { date: localYmd(fromDate), ref: "", description: "Balance brought forward", debit: "", credit: "", balance: opening.toNumber(), __style: "muted" },
      ...rows.map((r) => ({
        date: ymd(r.date), ref: r.refNo, description: r.description,
        debit: money(r.debit), credit: money(r.credit), balance: r.balance.toNumber(),
      })),
      {
        date: "", ref: "", description: `Balance as at ${localYmd(toDate)}`,
        debit: rows.reduce((s, r) => s.plus(r.debit), new Decimal(0)).toNumber(),
        credit: rows.reduce((s, r) => s.plus(r.credit), new Decimal(0)).toNumber(),
        balance: closing.toNumber(), __style: "total",
      },
      { date: "", ref: "", description: `${amountInWords(closing.abs().toNumber())}${closing.lt(0) ? " (CREDIT)" : ""}`, debit: "", credit: "", balance: "", __style: "muted" },
      { date: "", ref: "", description: `Ageing summary (as of ${localYmd(toDate)})`, debit: "", credit: "", balance: "", __style: "heading" },
      { date: "", ref: "", description: "Current", debit: "", credit: "", balance: ageing.current.toNumber() },
      { date: "", ref: "", description: "1–30 days", debit: "", credit: "", balance: ageing.d1_30.toNumber() },
      { date: "", ref: "", description: "31–60 days", debit: "", credit: "", balance: ageing.d31_60.toNumber() },
      { date: "", ref: "", description: "61–90 days", debit: "", credit: "", balance: ageing.d61_90.toNumber() },
      { date: "", ref: "", description: "> 90 days", debit: "", credit: "", balance: ageing.d90p.toNumber() },
      { date: "", ref: "", description: "Total outstanding", debit: "", credit: "", balance: ageingTotal.toNumber(), __style: "total" },
    ],
  };
}

async function charges(sp: URLSearchParams): Promise<ReportData> {
  const f = filters(sp);
  const list = await db.charge.findMany({
    where: chargeWhere(f),
    orderBy: CHARGE_ORDER,
    include: { resident: { select: { debtorCode: true, unitAddress: true, ownerName: true } } },
  });
  // Voided charges are listed, as on screen, but left out of the total.
  const total = list.filter((c) => !c.voided).reduce((s, c) => s.plus(dec(c.amount)), new Decimal(0));
  return {
    ...(await base()),
    title: "Charges",
    subtitle: `${filterSubtitle(f)} · ${list.length} charges`,
    landscape: true,
    columns: [
      { key: "invoiceNo", header: "Invoice #", width: 1.1 },
      { key: "date", header: "Date", width: 1.1 },
      { key: "code", header: "Debtor A/C", width: 1.1 },
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      { key: "description", header: "Description", width: 3 },
      { key: "period", header: "Period", width: 0.9 },
      numCol("amount", "Amount", 1.2),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows: list.map((c) => ({
      invoiceNo: c.invoiceNo ?? "",
      date: ymd(c.date),
      code: c.resident.debtorCode ?? "",
      unit: c.resident.unitAddress,
      owner: c.resident.ownerName,
      description: c.description,
      period: `${c.periodYear}-${String(c.periodMonth).padStart(2, "0")}`,
      amount: dec(c.amount).toNumber(),
      status: c.voided ? "Voided" : "Posted",
      ...(c.voided ? { __style: "muted" as const } : {}),
    })),
    totals: { invoiceNo: list.some((c) => c.voided) ? "TOTAL (excl. voided)" : "TOTAL", amount: total.toNumber() },
  };
}

async function receipts(sp: URLSearchParams): Promise<ReportData> {
  const f = filters(sp);
  const list = await db.receipt.findMany({
    where: receiptWhere(f),
    orderBy: RECEIPT_ORDER,
    include: { resident: { select: { debtorCode: true, unitAddress: true, ownerName: true } } },
  });
  const total = list.filter((r) => !r.voided).reduce((s, r) => s.plus(dec(r.amount)), new Decimal(0));
  return {
    ...(await base()),
    title: "Receipts",
    subtitle: `${filterSubtitle(f)} · ${list.length} receipts`,
    landscape: true,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "receiptNo", header: "Receipt #", width: 1.1 },
      { key: "code", header: "Debtor A/C", width: 1.1 },
      { key: "unit", header: "Unit", width: 2 },
      { key: "owner", header: "Owner", width: 2.5 },
      { key: "method", header: "Method", width: 0.9 },
      { key: "bankRef", header: "Bank Ref", width: 1.8 },
      numCol("amount", "Amount", 1.2),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows: list.map((r) => ({
      date: ymd(r.date),
      receiptNo: r.receiptNo,
      code: r.resident.debtorCode ?? "",
      unit: r.resident.unitAddress,
      owner: r.resident.ownerName,
      method: r.method,
      bankRef: r.bankRef ?? "",
      amount: dec(r.amount).toNumber(),
      status: r.voided ? "Voided" : "Posted",
      ...(r.voided ? { __style: "muted" as const } : {}),
    })),
    totals: { date: list.some((r) => r.voided) ? "TOTAL (excl. voided)" : "TOTAL", amount: total.toNumber() },
  };
}

async function suppliers(): Promise<ReportData> {
  const rows = await supplierBalances();
  const sum = (k: "billed" | "paid" | "balance") => rows.reduce((s, r) => s.plus(r[k]), new Decimal(0)).toNumber();
  return {
    ...(await base()),
    title: "Suppliers",
    subtitle: `${rows.length} ${rows.length === 1 ? "supplier" : "suppliers"}`,
    columns: [
      { key: "code", header: "Creditor A/C", width: 1.2 },
      { key: "name", header: "Name", width: 3 },
      { key: "contact", header: "Contact", width: 2 },
      { key: "phone", header: "Phone", width: 1.5 },
      numCol("billed", "Billed", 1.3),
      numCol("paid", "Paid", 1.3),
      numCol("balance", "Outstanding", 1.3),
      { key: "status", header: "Status", width: 1 },
    ],
    rows: rows.map((s) => ({
      code: s.creditorCode ?? "",
      name: s.name,
      contact: s.contact ?? "",
      phone: s.phone ?? "",
      billed: s.billed.toNumber(),
      paid: s.paid.toNumber(),
      balance: s.balance.toNumber(),
      status: s.active ? "Active" : "Inactive",
    })),
    totals: { code: "TOTAL", billed: sum("billed"), paid: sum("paid"), balance: sum("balance") },
  };
}

const BILL_STATUS_LABEL: Record<string, string> = { UNPAID: "Unpaid", PARTIAL: "Partial", PAID: "Paid", VOIDED: "Voided" };

async function bills(sp: URLSearchParams): Promise<ReportData> {
  const f = filters(sp);
  const list = await db.bill.findMany({
    where: billWhere(f),
    orderBy: BILL_ORDER,
    include: { supplier: { select: { name: true, creditorCode: true } } },
  });
  // Voided bills count only when the Voided tab is what was asked for.
  const counted = f.status === "VOIDED" ? list : list.filter((b) => b.status !== "VOIDED");
  let ta = new Decimal(0), tp = new Decimal(0);
  for (const b of counted) { ta = ta.plus(dec(b.amount)); tp = tp.plus(dec(b.paid)); }
  return {
    ...(await base()),
    title: "Bills",
    subtitle: `${filterSubtitle(f)} · ${list.length} bills`,
    landscape: true,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "due", header: "Due", width: 1.1 },
      { key: "invoiceNo", header: "Invoice #", width: 1.5 },
      { key: "code", header: "Creditor A/C", width: 1.1 },
      { key: "supplier", header: "Supplier", width: 3 },
      numCol("amount", "Amount", 1.3),
      numCol("paid", "Paid", 1.3),
      numCol("balance", "Balance", 1.3),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows: list.map((b) => ({
      date: ymd(b.date),
      due: ymd(b.dueDate),
      invoiceNo: b.invoiceNo,
      code: b.supplier.creditorCode ?? "",
      supplier: b.supplier.name,
      amount: dec(b.amount).toNumber(),
      paid: dec(b.paid).toNumber(),
      balance: dec(b.amount).minus(dec(b.paid)).toNumber(),
      status: BILL_STATUS_LABEL[b.status] ?? b.status,
      ...(b.status === "VOIDED" ? { __style: "muted" as const } : {}),
    })),
    totals: {
      date: counted.length < list.length ? "TOTAL (excl. voided)" : "TOTAL",
      amount: ta.toNumber(), paid: tp.toNumber(), balance: ta.minus(tp).toNumber(),
    },
  };
}

async function accounts(sp: URLSearchParams): Promise<ReportData> {
  const type = opt(sp, "type");
  const list = await db.account.findMany({ where: accountWhere(type), include: { parent: true }, orderBy: { code: "asc" } });
  return {
    ...(await base()),
    title: "Chart of Accounts",
    subtitle: `${type ?? "All types"} · ${list.length} accounts`,
    columns: [
      { key: "code", header: "A/C No.", width: 1.2 },
      { key: "name", header: "Description", width: 4 },
      { key: "type", header: "A/C Type", width: 1.4 },
      { key: "group", header: "A/C Group", width: 2 },
      { key: "classifiedAs", header: "Classified As", width: 1.2 },
      { key: "parent", header: "Group To A/C", width: 1.2 },
      { key: "status", header: "Status", width: 1 },
    ],
    rows: list.map((a) => ({
      code: a.code,
      name: a.name,
      type: acTypeLabel(a.type),
      group: a.group,
      classifiedAs: a.classifiedAs ?? "",
      parent: a.parent?.code ?? a.code,
      status: a.active ? "Active" : "Inactive",
      ...(a.active ? {} : { __style: "muted" as const }),
    })),
  };
}

async function cashBook(): Promise<ReportData> {
  const list = await db.cashEntry.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: CASH_BOOK_ORDER,
    include: { account: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
  });
  // As on screen: voided entries are listed but the totals leave them out.
  let tin = new Decimal(0), tout = new Decimal(0);
  for (const e of list) {
    if (e.voided) continue;
    if (e.direction === "IN") tin = tin.plus(dec(e.amount));
    else tout = tout.plus(dec(e.amount));
  }
  return {
    ...(await base()),
    title: "Cash Book",
    subtitle: `${list.length} entries · Net ${tin.minus(tout).toFixed(2)}`,
    landscape: true,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "refNo", header: "Ref", width: 1.1 },
      { key: "description", header: "Description", width: 3 },
      { key: "counterparty", header: "Paid to / Received from", width: 2.2 },
      { key: "account", header: "Account", width: 3 },
      { key: "method", header: "Method", width: 0.9 },
      numCol("in", "In", 1.2),
      numCol("out", "Out", 1.2),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows: list.map((e) => ({
      date: ymd(e.date),
      refNo: e.refNo,
      description: e.description,
      counterparty: e.counterparty ?? "",
      account: `${e.account.code} ${e.account.name}${e._count.lines > 1 ? ` + ${e._count.lines - 1} more` : ""}`,
      method: e.method,
      in: e.direction === "IN" ? dec(e.amount).toNumber() : "",
      out: e.direction === "OUT" ? dec(e.amount).toNumber() : "",
      status: e.voided ? "Voided" : "",
      ...(e.voided ? { __style: "muted" as const } : {}),
    })),
    totals: { date: list.some((e) => e.voided) ? "TOTAL (excl. voided)" : "TOTAL", in: tin.toNumber(), out: tout.toNumber() },
  };
}

const JOURNAL_STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted", VOIDED: "Voided" };

async function journal(sp: URLSearchParams): Promise<ReportData> {
  const f = filters(sp);
  const list = await db.journalEntry.findMany({
    where: journalWhere(f),
    include: { lines: { select: { debit: true } } },
    orderBy: JOURNAL_ORDER,
  });
  const rows = list.map((e) => ({ e, amount: e.lines.reduce((s, l) => s.plus(dec(l.debit)), new Decimal(0)) }));
  const counted = f.status === "VOIDED" ? rows : rows.filter((x) => x.e.status !== "VOIDED");
  return {
    ...(await base()),
    title: "Journal Entries",
    subtitle: `${filterSubtitle(f)} · ${list.length} ${list.length === 1 ? "entry" : "entries"}`,
    columns: [
      { key: "entryNo", header: "Entry #", width: 1.3 },
      { key: "date", header: "Date", width: 1.1 },
      { key: "description", header: "Description", width: 4 },
      { key: "reference", header: "Reference", width: 1.5 },
      numCol("amount", "Amount", 1.3),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows: rows.map(({ e, amount }) => ({
      entryNo: e.entryNo,
      date: ymd(e.date),
      description: e.description,
      reference: e.reference ?? "",
      amount: amount.toNumber(),
      status: JOURNAL_STATUS_LABEL[e.status] ?? e.status,
      ...(e.status === "VOIDED" ? { __style: "muted" as const } : {}),
    })),
    totals: {
      entryNo: counted.length < rows.length ? "TOTAL (excl. voided)" : "TOTAL",
      amount: counted.reduce((s, x) => s.plus(x.amount), new Decimal(0)).toNumber(),
    },
  };
}

async function batches(sp: URLSearchParams): Promise<ReportData> {
  const year = opt(sp, "year");
  const list = await db.batch.findMany(batchQuery(year ? Number(year) : undefined));
  let entries = 0, value = new Decimal(0);
  const rows = list.map((b) => {
    const v = b.entries.reduce((s, e) => e.lines.reduce((t, l) => t.plus(dec(l.debit)), s), new Decimal(0));
    entries += b.entries.length;
    value = value.plus(v);
    return {
      batchNo: b.batchNo,
      description: b.description,
      type: GROUP_LABEL[b.group],
      entries: b.entries.length,
      value: b.entries.length ? v.toNumber() : "",
      status: b.locked ? "Locked" : "Open",
    };
  });
  return {
    ...(await base()),
    title: "Batches",
    subtitle: `${year ?? "All years"} · ${list.length} batches`,
    columns: [
      { key: "batchNo", header: "Batch No.", width: 1.2 },
      { key: "description", header: "Description", width: 3.5 },
      { key: "type", header: "Type", width: 1.6 },
      { key: "entries", header: "Entries", align: "right", width: 0.9 },
      numCol("value", "Value", 1.4),
      { key: "status", header: "Status", width: 0.9 },
    ],
    rows,
    totals: { batchNo: "TOTAL", entries, value: value.toNumber() },
  };
}

async function drafts(): Promise<ReportData> {
  const [list, users] = await Promise.all([
    db.draft.findMany({ where: { associationId: DEFAULT_ASSOCIATION_ID }, orderBy: [{ date: "asc" }, { number: "asc" }] }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  return {
    ...(await base()),
    title: "Drafts to post",
    subtitle: `${list.length} waiting to be posted`,
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "number", header: "Number", width: 1.2 },
      { key: "type", header: "Type", width: 1.8 },
      { key: "party", header: "From / to", width: 3.5 },
      numCol("amount", "Amount", 1.3),
      { key: "keyedBy", header: "Keyed by", width: 1.5 },
    ],
    rows: list.map((d) => ({
      date: ymd(d.date),
      number: d.number,
      type: draftKindLabel(d),
      party: d.party,
      amount: dec(d.amount).toNumber(),
      keyedBy: d.createdBy ? name.get(d.createdBy) ?? "" : "",
    })),
    totals: { date: "TOTAL", amount: list.reduce((s, d) => s.plus(dec(d.amount)), new Decimal(0)).toNumber() },
  };
}

export const LIST_EXPORTS: Record<string, ExportDef> = {
  "residents": { screen: "residents", build: residents },
  "resident-statement": { screen: "residents", build: residentStatementExport },
  "charges": { screen: "charges", build: charges },
  "receipts": { screen: "receipts", build: receipts },
  "suppliers": { screen: "suppliers", build: suppliers },
  "bills": { screen: "bills", build: bills },
  "accounts": { screen: "accounts", build: accounts },
  "cash-book-list": { screen: "cash-book", build: cashBook },
  "journal": { screen: "journal", build: journal },
  "batches": { screen: "batches", build: batches },
  "drafts": { screen: "drafts", build: drafts },
};
