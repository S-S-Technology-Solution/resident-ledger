import Decimal from "decimal.js";
import { accountBalances, type AccountBalance } from "./reports";
import { getAssociation } from "./association";
import { fmtRM } from "./money";

/**
 * The two financial statements in the accountant's layout: the Statement of
 * Income and Expenditure and the Statement of Financial Position. Built once
 * as rows so the page, the PDF and the Excel file show the same thing.
 */

export type FsRow = {
  label?: string;
  // Absent: the row has no figure (a section title or a gap).
  amount?: Decimal;
  pct?: Decimal | null;
  heading?: boolean;
  bold?: boolean;
  indent?: boolean;
  // Rule over the figure; "double" also closes it with a double underline.
  rule?: "above" | "double";
  gap?: boolean;
};

export type FinancialStatement = {
  associationName: string;
  title: string;
  period: string;
  // Column headings over the figures, top to bottom, e.g. ["31.7.2026", "RM"].
  amountHeading: string[];
  showPct: boolean;
  rows: FsRow[];
  // Statement of financial position only: assets less what is owed, minus the funds; zero when it balances.
  difference?: Decimal;
};

/** Accounting figures: negatives in brackets. */
export const fmtAcct = (v: Decimal) => (v.lt(0) ? `(${fmtRM(v.abs())})` : fmtRM(v));

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
/** "31 JULY 2026" */
const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** "31.7.2026" */
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}`;

const totalOf = (xs: AccountBalance[]) => xs.reduce((s, a) => s.plus(a.balance), new Decimal(0));
const nonZero = (a: AccountBalance) => !a.balance.eq(0);

/** The first day of the financial year that `to` falls in. */
export function fyStartFor(to: string, fiscalYearStart: number) {
  const start = `${to.slice(0, 4)}-${String(fiscalYearStart).padStart(2, "0")}-01`;
  return start <= to ? start : `${Number(to.slice(0, 4)) - 1}${start.slice(4)}`;
}

/** The day before the next financial year starts. */
function fyEndFor(to: string, fiscalYearStart: number) {
  const start = new Date(fyStartFor(to, fiscalYearStart));
  return new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

/**
 * Statement of Income and Expenditure, year to date (or from `from`):
 *   Income, less the cost of security services, add other income, less
 *   expenditure, surplus/(deficit). Each figure also as a % of income.
 * Other income is the 5100 group; the cost of services is the expense
 * accounts classified "P" (Security services).
 */
export async function incomeStatement(to: string, from?: string): Promise<FinancialStatement> {
  const association = await getAssociation();
  const fyStart = fyStartFor(to, association.fiscalYearStart);
  const start = from || fyStart;
  const all = (await accountBalances({ from: new Date(start), to: new Date(to) })).filter(nonZero);

  const isOther = (a: AccountBalance) => a.code.startsWith("5100/");
  const isCost = (a: AccountBalance) => a.classifiedAs === "P";
  const income = all.filter((a) => a.type === "INCOME" && !isOther(a));
  const other = all.filter((a) => a.type === "INCOME" && isOther(a));
  const cost = all.filter((a) => a.type === "EXPENSE" && isCost(a));
  const expense = all.filter((a) => a.type === "EXPENSE" && !isCost(a));

  const base = totalOf(income);
  const pct = (v: Decimal) => (base.eq(0) ? null : v.div(base).times(100));
  const item = (a: AccountBalance): FsRow => ({ label: a.name, amount: a.balance, pct: pct(a.balance), indent: true });
  const rows: FsRow[] = [];

  rows.push({ label: "Income", heading: true });
  rows.push(...income.map(item));
  if (income.length !== 1) rows.push({ amount: base, pct: pct(base), rule: "above" });
  let running = base;

  if (cost.length) {
    rows.push({ gap: true }, { label: "Less : Cost of security services", heading: true }, ...cost.map(item));
    running = running.minus(totalOf(cost));
    rows.push({ amount: running, pct: pct(running), rule: "above" });
  }
  if (other.length) {
    rows.push({ gap: true }, { label: "Add : Other income", heading: true }, ...other.map(item));
    running = running.plus(totalOf(other));
    rows.push({ amount: running, pct: pct(running), rule: "above", bold: true });
  }

  const spent = totalOf(expense);
  rows.push({ gap: true }, { label: "Less : Expenditure", heading: true }, ...expense.map(item));
  rows.push({ amount: spent, pct: pct(spent), rule: "above", bold: true });

  const net = running.minus(spent);
  const wholeYear = start === fyStart;
  rows.push({ gap: true }, {
    label: `Surplus/(Deficit) for the ${wholeYear ? "year" : "period"}`, amount: net, pct: pct(net), bold: true, rule: "double",
  });

  const period = !wholeYear
    ? `FOR THE PERIOD FROM ${longDate(start)} TO ${longDate(to)}`
    : to === fyEndFor(to, association.fiscalYearStart)
      ? `FOR THE YEAR ENDED ${longDate(to)}`
      : `FOR THE FINANCIAL PERIOD ENDED ${longDate(to)}`;

  return {
    associationName: association.name,
    title: "STATEMENT OF INCOME AND EXPENDITURE",
    period,
    amountHeading: ["RM"],
    showPct: true,
    rows,
  };
}

/**
 * Statement of Financial Position as at a date: non-current assets, current
 * assets less current liabilities, and the accumulated funds that pay for them.
 * Sections follow each account's group in the chart of accounts.
 */
export async function financialPosition(to: string): Promise<FinancialStatement> {
  const association = await getAssociation();
  const all = await accountBalances({ to: new Date(to) });
  const shown = all.filter(nonZero);

  const nonCurrent = shown.filter((a) => a.type === "ASSET" && a.group === "Fixed Assets");
  const current = shown.filter((a) => a.type === "ASSET" && a.group !== "Fixed Assets");
  const currentLiab = shown.filter((a) => a.type === "LIABILITY" && a.group !== "Non-current Liabilities");
  const longTermLiab = shown.filter((a) => a.type === "LIABILITY" && a.group === "Non-current Liabilities");
  // Accounts classified C2 hold surpluses not yet taken into the fund; they and
  // this period's surplus are the accumulated surplus carried forward.
  const funds = shown.filter((a) => a.type === "EQUITY" && a.classifiedAs !== "C2");
  const surplus = totalOf(all.filter((a) => a.type === "EQUITY" && a.classifiedAs === "C2"))
    .plus(totalOf(all.filter((a) => a.type === "INCOME")))
    .minus(totalOf(all.filter((a) => a.type === "EXPENSE")));

  const item = (a: AccountBalance): FsRow => ({ label: a.name, amount: a.balance });
  const rows: FsRow[] = [];

  const d = totalOf(nonCurrent);
  rows.push({ label: "NON-CURRENT ASSETS", heading: true }, ...nonCurrent.map(item), { amount: d, rule: "above" });

  const a = totalOf(current);
  rows.push({ gap: true }, { label: "CURRENT ASSETS", heading: true }, ...current.map(item), { amount: a, rule: "above" });

  const b = totalOf(currentLiab);
  rows.push({ gap: true }, { label: "CURRENT LIABILITIES", heading: true }, ...currentLiab.map(item), { amount: b, rule: "above" });

  const netCurrent = a.minus(b);
  rows.push({ gap: true }, { label: "NET CURRENT ASSETS", amount: netCurrent, bold: true });

  let netAssets = netCurrent.plus(d);
  if (longTermLiab.length) {
    rows.push({ amount: netAssets, rule: "above" });
    const l = totalOf(longTermLiab);
    rows.push({ gap: true }, { label: "LESS : NON-CURRENT LIABILITIES", heading: true }, ...longTermLiab.map(item), { amount: l, rule: "above" });
    netAssets = netAssets.minus(l);
  }
  rows.push({ amount: netAssets, rule: "double", bold: true });

  const fundTotal = totalOf(funds).plus(surplus);
  rows.push(
    { gap: true },
    { label: "ACCUMULATED FUNDS", heading: true },
    ...funds.map(item),
    { label: "Accumulated Surplus / (Deficit) carried forward", amount: surplus },
    { amount: fundTotal, rule: "double", bold: true },
  );

  return {
    associationName: association.name,
    title: "STATEMENT OF FINANCIAL POSITION",
    period: `AS AT ${longDate(to)}`,
    amountHeading: [shortDate(to), "RM"],
    showPct: false,
    rows,
    difference: netAssets.minus(fundTotal),
  };
}
