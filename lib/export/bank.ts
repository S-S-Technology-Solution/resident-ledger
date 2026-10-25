import Decimal from "decimal.js";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { bookItems, reconciliation, type Pick } from "../bank-statement/service";
import { base, numCol, ymd } from "./helpers";
import type { ExportDef, ReportData, Row } from "./types";

async function statementFor(sp: URLSearchParams) {
  const id = sp.get("statementId");
  if (!id) throw new Error("statementId is required");
  return db.bankStatement.findUniqueOrThrow({ where: { id } });
}

const period = (s: { bank: string; accountNo: string; periodFrom: Date; periodTo: Date; reconciledAt: Date | null }) =>
  `${s.bank} ${s.accountNo} · statement ${ymd(s.periodFrom)} to ${ymd(s.periodTo)}${s.reconciledAt ? ` · reconciled ${ymd(s.reconciledAt)}` : " · not yet signed off"}`;

/**
 * The bank reconciliation statement as at the statement's closing date, laid
 * out as on screen: bank balance, items in the books not yet through the bank,
 * bank items not in the books, adjusted balance against the cash book.
 */
async function bankReconciliation(sp: URLSearchParams): Promise<ReportData> {
  const s = await statementFor(sp);
  const rec = await reconciliation(s.id);
  const rows: Row[] = [];
  const line = (particulars: string, total: Decimal | number, style?: Row["__style"]) =>
    rows.push({ date: "", ref: "", particulars, amount: "", total: new Decimal(total).toNumber() + 0, ...(style ? { __style: style } : {}) });
  const items = (title: string, xs: { date: Date; ref: string; label: string; amount: number }[], sign: 1 | -1) => {
    rows.push({ date: "", ref: "", particulars: title, amount: "", total: "", __style: "heading" });
    for (const i of xs) rows.push({ date: ymd(i.date), ref: i.ref, particulars: i.label, amount: i.amount, total: "" });
    if (!xs.length) rows.push({ date: "", ref: "", particulars: "None", amount: "", total: "", __style: "muted" });
    line(`Total ${title.replace(/^(Add|Less): /, "").toLowerCase()}`, xs.reduce((t, i) => t.plus(i.amount), new Decimal(0)).times(sign), "total");
  };
  const bankLines = (title: string, ls: typeof rec.unmatched) => {
    if (!ls.length) return;
    rows.push({ date: "", ref: "", particulars: title, amount: "", total: "", __style: "heading" });
    for (const l of ls) {
      rows.push({
        date: ymd(l.date), ref: l.ref, particulars: `${l.type}${l.note ? ` — ${l.note}` : ""}`,
        amount: new Decimal(l.credit.toString()).minus(l.debit.toString()).toNumber(), total: "",
      });
    }
    // Lines through the bank but not in the books are taken out to reach the book figure.
    line("Total (net)", ls.reduce((t, l) => t.minus(l.credit.toString()).plus(l.debit.toString()), new Decimal(0)), "total");
  };

  line("Balance as per bank statement", rec.bankBalance, "total");
  items("Add: deposits in the books, not yet credited by the bank", rec.depositsInTransit, 1);
  items("Less: payments in the books, not yet presented", rec.unpresented, -1);
  bankLines("Bank items with no book entry", rec.noEntry);
  bankLines("Statement lines not yet matched", rec.unmatched);
  line("Adjusted bank balance", rec.adjusted, "total");
  line("Balance as per cash book", rec.bookBalance);
  line("Difference", rec.difference, "total");

  return {
    ...(await base()),
    title: `Bank Reconciliation as at ${ymd(rec.asAt)}`,
    subtitle: period(s),
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "ref", header: "Ref.", width: 1.2 },
      { key: "particulars", header: "Particulars", width: 4.6 },
      numCol("amount", "RM", 1.3),
      numCol("total", "RM", 1.4),
    ],
    rows,
    signatures: ["Prepared by", "Checked by", "Approved by"],
  };
}

/** Every line of one statement with the book entry it is matched to. */
async function statementLines(sp: URLSearchParams): Promise<ReportData> {
  const s = await statementFor(sp);
  const [lines, items] = await Promise.all([
    db.bankStatementLine.findMany({ where: { statementId: s.id }, orderBy: { lineNo: "asc" } }),
    bookItems(s.associationId),
  ]);
  const byKey = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]));
  const matchedTo = (l: (typeof lines)[number]) => {
    if (!l.matchKind) return "Not matched";
    if (l.matchKind === "none") return `No entry needed${l.note ? ` — ${l.note}` : ""}`;
    const picks: Pick[] = l.matchKind === "multi" ? ((l.matchItems as Pick[] | null) ?? []) : l.matchId ? [{ kind: l.matchKind as Pick["kind"], id: l.matchId }] : [];
    return picks.map((p) => byKey.get(`${p.kind}:${p.id}`)).filter((i) => !!i).map((i) => `${i.ref} ${i.label}`).join("; ");
  };
  const sum = (k: "debit" | "credit") => lines.reduce((t, l) => t.plus(l[k].toString()), new Decimal(0)).toNumber();
  return {
    ...(await base()),
    title: "Bank Statement Lines",
    subtitle: `${period(s)} · opening ${new Decimal(s.openingBalance.toString()).toFixed(2)}, closing ${new Decimal(s.closingBalance.toString()).toFixed(2)}`,
    landscape: true,
    columns: [
      { key: "ref", header: "Line", width: 1.1 },
      { key: "date", header: "Date", width: 1 },
      { key: "description", header: "Description", width: 3.6 },
      numCol("debit", "Debit", 1.1),
      numCol("credit", "Credit", 1.1),
      numCol("balance", "Balance", 1.3),
      { key: "matched", header: "In the books", width: 3.4 },
    ],
    rows: lines.map((l) => ({
      ref: l.ref, date: ymd(l.date),
      description: [l.type, l.serial, l.details.split("\n").join(" · ")].filter(Boolean).join(" · "),
      debit: Number(l.debit) || "", credit: Number(l.credit) || "", balance: Number(l.balance),
      matched: matchedTo(l),
    })),
    totals: { ref: "TOTAL", debit: sum("debit"), credit: sum("credit") },
  };
}

/** The uploaded statements with how far each is matched and signed off. */
async function statementsList(): Promise<ReportData> {
  const statements = await db.bankStatement.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { periodFrom: "asc" },
    include: { lines: { select: { matchKind: true } } },
  });
  return {
    ...(await base()),
    title: "Bank Statements",
    columns: [
      { key: "period", header: "Period", width: 2.2 },
      { key: "account", header: "Account", width: 1.8 },
      numCol("opening", "Opening", 1.3),
      numCol("closing", "Closing", 1.3),
      { key: "matched", header: "Lines matched", align: "right", width: 1.2 },
      { key: "status", header: "Status", width: 1.6 },
    ],
    rows: statements.map((s) => {
      const done = s.lines.filter((l) => l.matchKind).length;
      return {
        period: `${ymd(s.periodFrom)} – ${ymd(s.periodTo)}`, account: `${s.bank} ${s.accountNo}`,
        opening: Number(s.openingBalance), closing: Number(s.closingBalance), matched: `${done} / ${s.lines.length}`,
        status: s.reconciledAt ? `Reconciled ${ymd(s.reconciledAt)}` : done === s.lines.length ? "Ready to sign off" : "In progress",
      };
    }),
  };
}

export const BANK_EXPORTS: Record<string, ExportDef> = {
  "bank-reconciliation": { screen: "bank-statements", build: bankReconciliation },
  "bank-statement-lines": { screen: "bank-statements", build: statementLines },
  "bank-statements": { screen: "bank-statements", build: () => statementsList() },
};
