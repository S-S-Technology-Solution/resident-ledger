import Decimal from "decimal.js";
import { getDocumentProxy } from "unpdf";

/**
 * Reads an RHB current-account statement PDF (the "Account Statement / Penyata
 * Akaun" layout RHB has used since April 2023).
 *
 * The PDF carries real text with positions, so each printed row is rebuilt from
 * its text items and read by column. Whether an amount is a debit or a credit is
 * decided by the running balance rather than the column, and the whole statement
 * is refused unless opening + credits − debits lands exactly on the closing
 * balance — a misread line cannot slip through.
 */

export type StatementLine = {
  lineNo: number;
  date: Date;
  type: string;
  serial: string | null;
  details: string[];
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
};

export type ParsedStatement = {
  bank: "RHB";
  accountNo: string;
  periodFrom: Date;
  periodTo: Date;
  openingBalance: Decimal;
  closingBalance: Decimal;
  lines: StatementLine[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AMOUNT = /^-?[\d,]+\.\d{2}$/;
const DATE = /^(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;

// Everything left of this x is the date column; the description starts right of it.
const DESC_X = 70;
const SERIAL_X = 250;
const AMOUNTS_X = 340;

type Item = { x: number; s: string };
type Row = { page: number; y: number; items: Item[] };

const money = (s: string) => new Decimal(s.replace(/,/g, ""));

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

/** "1 Feb 26" → Date */
function periodDate(s: string) {
  const m = s.trim().match(/^(\d{1,2}) (\w{3}) (\d{2})$/);
  if (!m) throw new Error(`Unrecognised statement period date "${s}"`);
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) throw new Error(`Unrecognised month in "${s}"`);
  return utcDate(2000 + Number(m[3]), month, Number(m[1]));
}

async function readRows(bytes: Uint8Array): Promise<Row[]> {
  const pdf = await getDocumentProxy(bytes);
  const rows: Row[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, Item[]>();
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const y = Math.round(raw.transform[5]);
      const list = byY.get(y) ?? [];
      list.push({ x: Math.round(raw.transform[4]), s: raw.str.trim() });
      byY.set(y, list);
    }
    const ys = [...byY.keys()].sort((a, b) => b - a);
    for (const y of ys) rows.push({ page: p, y, items: byY.get(y)!.sort((a, b) => a.x - b.x) });
  }
  return rows;
}

const text = (r: Row) => r.items.map((i) => i.s).join(" ");

export async function parseRhbStatement(bytes: Uint8Array): Promise<ParsedStatement> {
  const rows = await readRows(bytes);
  const all = rows.map(text).join("\n");

  if (!/RHB Bank Berhad/.test(all) || !/Account Statement/.test(all)) {
    throw new Error("This doesn't look like an RHB account statement.");
  }

  const period = all.match(/Statement Period.*?:\s*(\d{1,2} \w{3} \d{2})\s*[–-]\s*(\d{1,2} \w{3} \d{2})/);
  if (!period) throw new Error("Couldn't find the statement period.");
  const periodFrom = periodDate(period[1]);
  const periodTo = periodDate(period[2]);

  // Summary row: account name, number, opening, closing, interest YTD.
  const summary = rows.find((r) => /^\d{10,}$/.test(r.items[1]?.s ?? "") && r.items.filter((i) => AMOUNT.test(i.s)).length >= 2);
  if (!summary) throw new Error("Couldn't find the account summary (account number and balances).");
  const accountNo = summary.items[1].s;
  const summaryAmounts = summary.items.filter((i) => AMOUNT.test(i.s)).map((i) => money(i.s));
  const openingBalance = summaryAmounts[0];
  const closingBalance = summaryAmounts[1];

  // Transaction rows sit between each page's column header and its footer.
  const lines: StatementLine[] = [];
  let inActivity = false;
  let current: StatementLine | null = null;
  let broughtForward: Decimal | null = null;

  for (const row of rows) {
    const t = text(row);
    if (/^(Date|Tarikh)\b/.test(t) && /Balance|Baki/.test(t)) { inActivity = true; continue; }
    if (/^Member of PIDM/.test(t) || /^Account Statement/.test(t)) { inActivity = false; continue; }
    if (!inActivity) continue;

    const first = row.items[0];
    const dateMatch = first && first.x < DESC_X ? first.s.match(DATE) : null;
    if (dateMatch) {
      const rest = row.items.slice(1);
      const desc = rest.filter((i) => i.x < SERIAL_X).map((i) => i.s).join(" ");
      const serial = rest.find((i) => i.x >= SERIAL_X && i.x < AMOUNTS_X && /^\d+$/.test(i.s))?.s ?? null;
      const amounts = rest.filter((i) => i.x >= AMOUNTS_X && AMOUNT.test(i.s)).map((i) => money(i.s));

      if (/B\/F BALANCE/.test(desc)) { broughtForward = amounts.at(-1) ?? null; continue; }
      if (/C\/F BALANCE/.test(desc)) continue;
      if (amounts.length < 2) throw new Error(`Line on ${first.s} has no amount and balance: "${t}"`);

      // Statements run within one calendar month, so the period sets the year;
      // December lines on a January statement belong to the year before.
      const month = MONTHS.indexOf(dateMatch[2]);
      const year = month > periodTo.getUTCMonth() ? periodTo.getUTCFullYear() - 1 : periodTo.getUTCFullYear();
      current = {
        lineNo: lines.length + 1,
        date: utcDate(year, month, Number(dateMatch[1])),
        type: desc,
        serial,
        details: [],
        debit: new Decimal(0),
        credit: new Decimal(0),
        balance: amounts[amounts.length - 1],
      };
      // Hold the amount on the line until the balance check decides its side.
      (current as StatementLine & { amount?: Decimal }).amount = amounts[amounts.length - 2];
      lines.push(current);
    } else if (current && first && first.x >= DESC_X && first.x < SERIAL_X && !AMOUNT.test(t)) {
      current.details.push(t);
    }
  }

  if (!lines.length) throw new Error("No transactions found on this statement.");

  let running = broughtForward ?? openingBalance;
  if (!running.eq(openingBalance)) {
    throw new Error(`Brought-forward balance ${running.toFixed(2)} doesn't match the opening balance ${openingBalance.toFixed(2)}.`);
  }
  for (const line of lines) {
    const amount = (line as StatementLine & { amount?: Decimal }).amount!;
    delete (line as StatementLine & { amount?: Decimal }).amount;
    if (running.plus(amount).eq(line.balance)) line.credit = amount;
    else if (running.minus(amount).eq(line.balance)) line.debit = amount;
    else {
      throw new Error(
        `Line ${line.lineNo} (${line.type}, RM ${amount.toFixed(2)}) doesn't follow from the previous balance ${running.toFixed(2)} to ${line.balance.toFixed(2)}.`,
      );
    }
    // Long numeric trace references carry no meaning for anyone reading the line.
    line.details = line.details.filter((d) => !/^\d{20,}$/.test(d) && d !== "-");
    running = line.balance;
  }
  if (!running.eq(closingBalance)) {
    throw new Error(`Transactions end at ${running.toFixed(2)} but the statement's closing balance is ${closingBalance.toFixed(2)}.`);
  }

  return { bank: "RHB", accountNo, periodFrom, periodTo, openingBalance, closingBalance, lines };
}
