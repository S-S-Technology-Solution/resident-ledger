/**
 * Suggestions for pairing a statement line with the books.
 *
 * Pure functions over plain data so the page can call them for every line
 * without a query each: the resident guess reads the payer's note, the
 * candidate search compares amounts, dates and cheque numbers.
 */

export type ResidentRef = { id: string; debtorCode: string | null; unitAddress: string; ownerName: string };

/** "No 42A, Jln 1/10" → "42A|10" */
function addressKey(unitAddress: string) {
  const m = unitAddress.match(/No\s*(\d+[A-Z]?),\s*Jln\s*1\/(\d+)/i);
  return m ? `${m[1].toUpperCase()}|${Number(m[2])}` : null;
}

// House number then road ("30, Jln 1/4", "26Jln SC1/6", "11-1/8", "12A 1/4"), or
// road then house number ("Jalan 1/10, No 6"). Roads in the estate are Jln 1/x.
const HOUSE_FIRST = [
  /(?:NO\.?\s*)?(\d{1,3}[A-Z]?)\s*[,-]?\s*(?:JLN|JALAN|JL)\.?\s*(?:SUNWAY CHERAS|SUNWAY|SC|S\.C\.?)?\s*1\s*[/ -]\s*(\d{1,2})\b/g,
  /(?:NO\.?\s*)?(\d{1,3}[A-Z]?)\s*[,-]\s*1\s*\/\s*(\d{1,2})\b/g,
  /\b(\d{1,3}[A-Z]?)\s*(?:SC|SUNWAY)\s*1\s*\/\s*(\d{1,2})\b/g,
  /(?<![\d/])(\d{1,3}[A-Z]?)\s+1\/(\d{1,2})\b/g,
];
const ROAD_FIRST = /\b(?:JLN|JALAN)\s*(?:SUNWAY|SC)?\s*1\s*\/\s*(\d{1,2})\s*,?\s*(?:NO\.?\s*)?(\d{1,3}[A-Z]?)\b/g;

const STOP = new Set(["BIN", "BINTI", "BT", "BTE", "AL", "AP", "MR", "MRS", "MDM", "DR", "SDN", "BHD", "ENTERPRISE", "AND"]);
function nameTokens(s: string) {
  return new Set((s.toUpperCase().match(/[A-Z]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)));
}

export type ResidentGuess = { resident: ResidentRef; how: "address" | "name" } | null;

export function guessResident(details: string[], residents: ResidentRef[]): ResidentGuess {
  const note = details.join(" ").toUpperCase();
  const keys = new Set<string>();
  for (const re of HOUSE_FIRST) for (const m of note.matchAll(re)) keys.add(`${m[1]}|${Number(m[2])}`);
  for (const m of note.matchAll(ROAD_FIRST)) keys.add(`${m[2]}|${Number(m[1])}`);

  const byAddress = residents.filter((r) => {
    const k = addressKey(r.unitAddress);
    return k !== null && keys.has(k);
  });
  if (byAddress.length === 1) return { resident: byAddress[0], how: "address" };

  // Only fall back to the payer's name when the note gives no address at all,
  // and only when two or more name words agree with exactly one owner.
  if (keys.size === 0) {
    const payer = nameTokens(details.slice(0, 3).join(" "));
    const byName = residents.filter((r) => {
      const owner = nameTokens(r.ownerName);
      let shared = 0;
      for (const w of owner) if (payer.has(w)) shared++;
      return shared >= 2;
    });
    if (byName.length === 1) return { resident: byName[0], how: "name" };
  }
  return null;
}

/** Charges the bank levies itself — they go straight to the bank charges account. */
export function isBankCharge(type: string) {
  return /SVC CHARGE|SERVICE CHARGE|CHEQUE STAMP|CHQ STAMP|STAMP DUTY|COMMISSION|\bFEE\b|CHARGES?$/i.test(type);
}

export type BookItem = {
  kind: "receipt" | "billPayment" | "cashEntry" | "refund" | "bf";
  id: string;
  date: Date;
  amount: number;
  direction: "IN" | "OUT";
  ref: string;         // receipt no, PV/CR no, or bill no
  label: string;       // resident or payee
  bankRef: string | null;
  chequeNo: string | null;
  residentId?: string | null;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const DAY = 86_400_000;

/**
 * Book items that could be this line, best first. A cheque number or bank
 * reference that agrees is decisive; otherwise the amount must agree exactly
 * and the book date sit within a fortnight before to a few days after. When
 * the payer's note points at a resident, that resident's receipts rank first —
 * many residents pay the same amount on the same day.
 */
export function candidatesFor(
  line: { date: Date; debit: number; credit: number; serial: string | null },
  items: BookItem[],
  residentId?: string | null,
) {
  const isIn = line.credit > 0;
  const amount = isIn ? line.credit : line.debit;
  const serial = digits(line.serial);
  return items
    .filter((i) => i.direction === (isIn ? "IN" : "OUT") && Math.abs(i.amount - amount) < 0.005)
    .map((i) => {
      const refAgrees = serial !== "" && (digits(i.chequeNo) === serial || digits(i.bankRef) === serial);
      const residentAgrees = !!residentId && i.residentId === residentId;
      const days = (line.date.getTime() - i.date.getTime()) / DAY;
      const dateOk = days >= -3 && days <= 14;
      const score = (refAgrees ? 100 : 0) + (residentAgrees ? 50 : 0) + (dateOk ? 10 - Math.min(Math.abs(days), 10) : -100);
      return { item: i, refAgrees, residentAgrees, days, score };
    })
    .filter((c) => c.refAgrees || c.score > -50)
    .sort((a, b) => b.score - a.score);
}
