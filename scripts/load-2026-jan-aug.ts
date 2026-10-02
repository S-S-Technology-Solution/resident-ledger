/**
 * One-off load of TSCRA's January–August 2026 bank activity, from the eight RHB
 * statements and the accountant's answers in
 * "TSCRA bank Jan-Aug 2026 for accountant 2.xlsx" (returned 1 Oct 2026).
 *
 *   1. Invoice numbering runs 26001 onwards (accountant: "Inv 26001 … running").
 *   2. Monthly fees Jan–Sep 2026 for every active resident, one invoice each.
 *   3. Advance payments brought forward are set against those fees.
 *   4. The statements are uploaded in order.
 *   5. Every line, in date order, is entered and paired with its statement line:
 *      resident receipts (A1004 onwards, oldest charges first), the ADUN
 *      contribution, bank charges, Valiant Force cheques, and the returned
 *      cheque 936 pair as needing no entry. The other cheques wait for their
 *      payees.
 *   6. January is signed off if it agrees.
 *
 * Refuses to run unless the ledger holds only the opening balances, so it can
 * never double-post. Run with DATABASE_URL pointing at the target database.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { db } from "../lib/db";
import { DEFAULT_ASSOCIATION_ID as ASSOC } from "../lib/association";
import { parseRhbStatement } from "../lib/bank-statement/rhb";
import { isBankCharge } from "../lib/bank-statement/match";
import { saveStatement, matchLine, markNoEntry, reconciliation, markReconciled } from "../lib/bank-statement/service";
import { postCharge } from "../lib/charge-posting";
import { postReceipt } from "../lib/receipt-posting";
import { postBillPayment } from "../lib/bill-posting";
import { createCashEntry } from "../lib/cash-book";
import { residentOutstanding } from "../lib/ar";

const ROOT = path.resolve(__dirname, "..");
const RESPONSE = path.join(ROOT, "TSCRA bank Jan-Aug 2026 for accountant 2.xlsx");
const STATEMENTS = [
  "RHB TSCRA 012026.pdf", "RHB TSCRA 022026.pdf", "MAR'26 RHB.pdf", "RHB TSCRA 042026.pdf",
  "RHB TSCRA 052026.pdf", "RHB TSCRA 062026.pdf", "RHB TSCRA 072026.pdf", "RHB TSCRA 082026.pdf",
];
const VALIANT_AMOUNT = "15415.92";
const BF_CHEQUE = "938";            // settles Valiant's December 2025 bill brought forward
const RETURNED_CHEQUE = "936";      // bounced 2 Jan, presented again 19 Jan
const CONTRIBUTION_LINE = "B2606-004";
// Held back pending the accountant's confirmation (raised 1 Oct 2026):
//   B2601-059  Chaminda's RM 2,880 "2023 and 2024" was assigned to No 10 Jln 1/6,
//              leaving No 10 RM 2,520 in credit while his No 20 still owes.
//   B2607-013  "OH WAI HONG / No. 17 OKS" was matched to No 37 by name; the same
//              payer paid for No 17 Jln 1/6 (Oh Kok Siong) in January.
const HELD = new Set(["B2601-059", "B2607-013"]);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cellText = (v: ExcelJS.CellValue) =>
  v === null || v === undefined ? "" : typeof v === "object" && "result" in v ? String(v.result ?? "") : String(v).trim();

type Resident = { id: string; debtorCode: string | null; unitAddress: string; ownerName: string };

/** "No 21 Jln 1/10" (as the accountant wrote it) → the resident at that address. */
function byWrittenAddress(text: string, residents: Resident[]) {
  const m = text.match(/No\.?\s*(\d+[A-Z]?)\s*,?\s*Jln\s*1\/(\d+)/i);
  if (!m) return null;
  const want = `No ${m[1].toUpperCase()}, Jln 1/${Number(m[2])}`.toLowerCase();
  return residents.find((r) => r.unitAddress.toLowerCase() === want) ?? null;
}

/** Line ref → resident (or "contribution"), from the Money in tab. */
async function readMoneyIn(residents: Resident[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(RESPONSE);
  const ws = wb.getWorksheet("Money in")!;
  const map = new Map<string, { residentId: string | null; amount: string; note: string }>();
  ws.eachRow((row, n) => {
    if (n < 5) return;
    const ref = cellText(row.getCell(1).value);
    if (!/^B\d{4}-\d{3}$/.test(ref)) return;
    const amount = new Decimal(cellText(row.getCell(5).value)).toFixed(2);
    const proposed = cellText(row.getCell(6).value);
    const comment = cellText(row.getCell(12).value);
    if (ref === CONTRIBUTION_LINE) { map.set(ref, { residentId: null, amount, note: comment }); return; }
    const fromAddress = byWrittenAddress(comment, residents);
    const fromCode = residents.find((r) => r.debtorCode === proposed) ?? null;
    const resident = fromAddress ?? fromCode;
    if (!resident) throw new Error(`${ref}: no resident from the accountant's answer (proposed "${proposed}", comment "${comment}")`);
    map.set(ref, { residentId: resident.id, amount, note: comment });
  });
  return map;
}

async function main() {
  // ---- guard: only opening balances may exist
  const [charges, receipts, statements, entries] = await Promise.all([
    db.charge.count({ where: { isOpeningBalance: false } }),
    db.receipt.count({ where: { isOpeningBalance: false } }),
    db.bankStatement.count(),
    db.journalEntry.count({ where: { source: { not: "opening" } } }),
  ]);
  if (charges || receipts || statements || entries) {
    throw new Error(`Refusing to run: found ${charges} charges, ${receipts} receipts, ${statements} statements, ${entries} non-opening journals.`);
  }

  const residents: Resident[] = await db.resident.findMany({
    where: { associationId: ASSOC, active: true },
    select: { id: true, debtorCode: true, unitAddress: true, ownerName: true },
    orderBy: { debtorCode: "asc" },
  });
  const moneyIn = await readMoneyIn(residents);
  const account = async (code: string) => db.account.findFirstOrThrow({ where: { associationId: ASSOC, code } });
  const [bankCharges, guardServices, contributions] = await Promise.all([
    account("90B1/000"), account("6000/0001"), account("5100/0001"),
  ]);
  const bfBill = await db.bill.findFirstOrThrow({ where: { associationId: ASSOC, isOpeningBalance: true, supplier: { name: { contains: "Valiant" } } } });

  // ---- 1. invoice numbering
  const invoiceSeq = { prefix: "", padding: 5, reset: "NEVER", startAt: 26001 };
  await db.numberSequence.upsert({
    where: { associationId_key: { associationId: ASSOC, key: "INVOICE" } },
    update: invoiceSeq,
    create: { associationId: ASSOC, key: "INVOICE", ...invoiceSeq },
  });

  // ---- 2. monthly fees Jan–Sep
  for (let month = 1; month <= 9; month++) {
    const date = `2026-${String(month).padStart(2, "0")}-01`;
    const full = await db.resident.findMany({ where: { associationId: ASSOC, active: true }, orderBy: { debtorCode: "asc" } });
    for (const r of full) {
      if (new Decimal(r.monthlyFee.toString()).lte(0)) continue;
      await postCharge({
        residentId: r.id, date, periodMonth: month, periodYear: 2026,
        amount: new Decimal(r.monthlyFee.toString()).toFixed(2),
        description: `Monthly fee — 2026-${String(month).padStart(2, "0")}`,
      });
    }
    console.log(`fees ${date}: done`);
  }

  // ---- 3. advance payments brought forward → oldest open charges
  const advances = await db.receipt.findMany({ where: { associationId: ASSOC, isOpeningBalance: true, voided: false }, include: { allocations: true } });
  for (const a of advances) {
    let left = new Decimal(a.amount.toString()).minus(a.allocations.reduce((s, x) => s.plus(x.amount.toString()), new Decimal(0)));
    for (const c of await residentOutstanding(a.residentId)) {
      if (left.lte(0)) break;
      if (c.open.lte(0)) continue;
      const take = Decimal.min(c.open, left);
      await db.paymentAllocation.create({ data: { receiptId: a.id, chargeId: c.id, amount: take.toFixed(2) } });
      left = left.minus(take);
    }
  }
  console.log(`advances applied: ${advances.length}`);

  // ---- 4. statements
  for (const f of STATEMENTS) {
    const parsed = await parseRhbStatement(new Uint8Array(readFileSync(path.join(ROOT, "bank-statement", f))));
    await saveStatement(parsed, f, null, ASSOC);
  }
  const lines = await db.bankStatementLine.findMany({
    where: { statement: { associationId: ASSOC } },
    orderBy: [{ date: "asc" }, { statement: { periodFrom: "asc" } }, { lineNo: "asc" }],
  });
  console.log(`statement lines: ${lines.length}`);

  // ---- 5. enter and pair every line
  const left: string[] = [];
  const done: Record<string, number> = {};
  const tally = (k: string) => { done[k] = (done[k] ?? 0) + 1; };
  for (const l of lines) {
    const date = iso(l.date);
    const credit = new Decimal(l.credit.toString()), debit = new Decimal(l.debit.toString());
    const cheque = l.serial ? String(Number(l.serial)) : null;

    if (credit.gt(0)) {
      if (l.type === "CLG CHQ RETURNED") { await markNoEntry(l.id, `Cheque ${RETURNED_CHEQUE} (Dr James) returned 2 Jan, presented again 19 Jan`); tally("returned cheque"); continue; }
      if (HELD.has(l.ref)) { left.push(`${l.ref} ${date} RM ${credit.toFixed(2)} — held for the accountant to confirm the resident`); continue; }
      const answer = moneyIn.get(l.ref);
      if (!answer) throw new Error(`${l.ref}: not on the Money in tab`);
      if (answer.amount !== credit.toFixed(2)) throw new Error(`${l.ref}: amount ${credit} differs from the workbook's ${answer.amount}`);
      if (answer.residentId === null) {
        const e = await createCashEntry({ direction: "IN", date, amount: credit.toFixed(2), description: "Contribution from ADUN", accountId: contributions.id, counterparty: "ADUN", method: "BANK", bankRef: l.ref });
        await matchLine(l.id, "cashEntry", e.id); tally("contribution"); continue;
      }
      const r = await postReceipt({ residentId: answer.residentId, date, amount: credit.toFixed(2), method: "BANK", bankRef: l.serial ?? undefined, allocations: [] });
      await matchLine(l.id, "receipt", r.id); tally("resident receipt"); continue;
    }

    if (isBankCharge(l.type)) {
      const e = await createCashEntry({ direction: "OUT", date, amount: debit.toFixed(2), description: `Bank charge — ${l.type}`, accountId: bankCharges.id, counterparty: "RHB Bank", method: "BANK", bankRef: l.ref });
      await matchLine(l.id, "cashEntry", e.id); tally("bank charge"); continue;
    }
    if (cheque === RETURNED_CHEQUE) { await markNoEntry(l.id, `Cheque ${RETURNED_CHEQUE} (Dr James, written 31 Dec 2025) presented again after return`); tally("returned cheque"); continue; }
    if (cheque === BF_CHEQUE && debit.toFixed(2) === VALIANT_AMOUNT) {
      await postBillPayment({ billId: bfBill.id, date, amount: debit.toFixed(2), method: "BANK", bankRef: cheque });
      const p = await db.billPayment.findFirstOrThrow({ where: { billId: bfBill.id, bankRef: cheque } });
      await matchLine(l.id, "billPayment", p.id); tally("Valiant (Dec 2025 bill)"); continue;
    }
    if (debit.toFixed(2) === VALIANT_AMOUNT) {
      const e = await createCashEntry({ direction: "OUT", date, amount: debit.toFixed(2), description: `Valiant Force — monthly security guard fee (cheque ${cheque})`, accountId: guardServices.id, counterparty: "Valiant Force Sdn Bhd", method: "BANK", bankRef: l.ref, chequeNo: cheque ?? undefined });
      await matchLine(l.id, "cashEntry", e.id); tally("Valiant (monthly)"); continue;
    }
    left.push(`${l.ref} ${date} cheque ${cheque} RM ${debit.toFixed(2)}`);
  }
  console.log("entered:", done);
  console.log(`left unmatched (${left.length}):\n  ${left.join("\n  ")}`);

  // ---- 6. reconciliation per month; sign off January
  for (const s of await db.bankStatement.findMany({ where: { associationId: ASSOC }, orderBy: { periodFrom: "asc" } })) {
    const r = await reconciliation(s.id);
    console.log(`${iso(s.periodTo)}  bank ${r.bankBalance.toFixed(2)}  book ${r.bookBalance.toFixed(2)}  unmatched ${r.unmatched.length}  difference ${r.difference.toFixed(2)}${r.canSignOff ? "  → can sign off" : ""}`);
    if (r.canSignOff && iso(s.periodTo) === "2026-01-31") { await markReconciled(s.id, null); console.log("  January signed off"); }
  }
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
