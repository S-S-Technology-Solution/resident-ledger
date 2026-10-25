import Decimal from "decimal.js";
import { db } from "../db";
import { DEFAULT_ASSOCIATION_ID } from "../association";
import { bookItems, reconciliation, type Pick } from "../bank-statement/service";
import { controlAccount } from "../control-accounts";
import { base, numCol, ymd } from "./helpers";
import type { ExportDef, ReportData, Row } from "./types";

async function statementFor(sp: URLSearchParams) {
  const id = sp.get("statementId");
  if (!id) throw new Error("statementId is required");
  return db.bankStatement.findUniqueOrThrow({ where: { id } });
}

const period = (s: { bank: string; accountNo: string; periodFrom: Date; periodTo: Date; reconciledAt: Date | null }) =>
  `${s.bank} ${s.accountNo} · statement ${ymd(s.periodFrom)} to ${ymd(s.periodTo)}${s.reconciledAt ? ` · reconciled ${ymd(s.reconciledAt)}` : " · not yet signed off"}`;

const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/**
 * The bank reconciliation statement as at the statement's closing date, in the
 * layout of the association's old Million reports: bank balance, then only the
 * sections that have items (each listed with its subtotal), then the balance
 * as per bank account, double-underlined.
 */
async function bankReconciliation(sp: URLSearchParams): Promise<ReportData> {
  const s = await statementFor(sp);
  const [rec, bank] = await Promise.all([reconciliation(s.id), controlAccount("BANK", s.associationId)]);
  const rows: Row[] = [];
  const blank = { date: "", ref: "", party: "", invoice: "", cheque: "" };
  const label = (text: string, amount: Decimal | null, style: Row["__style"] = "label") =>
    rows.push({ ...blank, date: text, amount: amount === null ? "" : amount.toNumber() + 0, __style: style });
  const section = (title: string, list: Omit<Row, "amount" | "__style">[], amounts: number[]) => {
    if (!list.length) return;
    label(title, null);
    list.forEach((r, i) => rows.push({ ...blank, ...r, amount: amounts[i], __style: "item" }));
    rows.push({ ...blank, amount: amounts.reduce((t, a) => t.plus(a), new Decimal(0)).toNumber() + 0, __style: "subtotal" });
  };
  const cheque = (no: string | null) => (!no ? "" : /^[A-Z]{2,5}\s/i.test(no) ? no : `${s.bank} ${no}`);
  const book = (xs: typeof rec.unpresented) =>
    xs.map((i) => {
      // "Supplier — INV1, INV2" for a supplier payment; otherwise the label is the payee.
      const [party, rest] = i.label.split(" — ");
      return {
        date: dmy(i.date), ref: i.ref,
        party: i.kind === "billPayment" ? party : i.kind === "bf" ? (rest ?? i.label) : i.label,
        invoice: i.kind === "billPayment" ? rest ?? "" : i.kind === "bf" ? "B/F" : "",
        cheque: cheque(i.chequeNo ?? i.bankRef),
      };
    });
  // Statement lines not in the books are taken off (credits) or added back (debits): shown as credit less debit.
  const lines = (ls: typeof rec.unmatched) =>
    ls.map((l) => ({ date: dmy(l.date), ref: l.ref, party: `${l.type}${l.note ? ` — ${l.note}` : ""}`, invoice: "", cheque: l.serial ?? "" }));
  const net = (ls: typeof rec.unmatched) => ls.map((l) => new Decimal(l.credit.toString()).minus(l.debit.toString()).toNumber());

  const byDate = <T extends { date: Date; ref: string }>(xs: T[]) =>
    [...xs].sort((x, y) => x.date.getTime() - y.date.getTime() || x.ref.localeCompare(y.ref));
  const deposits = byDate(rec.depositsInTransit), unpresented = byDate(rec.unpresented);

  label("BALANCE AS PER BANK STATEMENT", rec.bankBalance);
  section("ADD : DEPOSITS NOT YET CREDITED", book(deposits), deposits.map((i) => i.amount));
  section("LESS : UNPRESENTED CHEQUES", book(unpresented), unpresented.map((i) => i.amount));
  section("LESS : BANK ITEMS WITH NO BOOK ENTRY (NET)", lines(rec.noEntry), net(rec.noEntry));
  section("LESS : STATEMENT LINES NOT YET MATCHED (NET)", lines(rec.unmatched), net(rec.unmatched));
  label("BALANCE AS PER BANK ACCOUNT", rec.adjusted, "grand");
  // Only when bank and books disagree: show the cash book figure and the gap.
  if (!rec.difference.abs().lt(0.005)) {
    label("BALANCE AS PER CASH BOOK", rec.bookBalance);
    label("UNRECONCILED DIFFERENCE", rec.difference);
  }

  return {
    ...(await base()),
    title: "BANK RECONCILIATION",
    subtitle: `As At ${dmy(rec.asAt)}`,
    layout: "statement",
    accountLine: { left: `${bank.code}        ${bank.name}`, right: "MYR" },
    columns: [
      { key: "date", header: "Date", width: 1.1 },
      { key: "ref", header: "Ref.", width: 1.3 },
      { key: "party", header: "Particulars", width: 3.4 },
      { key: "invoice", header: "Invoice", width: 1.2 },
      { key: "cheque", header: "Cheque", width: 1.2 },
      numCol("amount", "MYR", 1.3),
    ],
    rows,
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
