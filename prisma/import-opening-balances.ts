import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Loads the cut-over balances from the previous system.
 *
 * GL figures come from the 31.12.2025 trial balance; the debtor detail is parsed
 * from the resident list's "Year 2025 B/F" column. The two tie out at
 * RM474,120.00, which is the check that the load is right.
 *
 * Safe to re-run — each piece replaces what was there before.
 *
 *   npx tsx prisma/import-opening-balances.ts <resident-list.txt>
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const ASSOC = "default";
const OPENING_DATE = new Date(Date.UTC(2025, 11, 31));
const SOURCE = process.argv[2] ?? "/tmp/tscra.txt";

// Balance sheet only. P&L accounts do not carry forward — the 2025 result is
// already folded into the accumulated fund figure below.
const GL: { code: string; debit?: number; credit?: number; note: string }[] = [
  { code: "3300/0000", debit: 74_265.77, note: "RHB Bank Berhad" },
  { code: "3000/0000", debit: 474_120.00, note: "Residents Account (control)" },
  { code: "3300/0010", debit: 238.60, note: "Cash In Hand" },
  { code: "2010/0000", debit: 53_359.00, note: "Electrical & Equipment: cost" },
  { code: "2010/0100", credit: 53_358.00, note: "Electrical & Equipment: accum depn" },
  { code: "2020/0000", debit: 87_047.00, note: "Fittings & Signage: cost" },
  { code: "2020/0100", credit: 44_845.80, note: "Fittings & Signage: accum depn" },
  { code: "2030/0000", debit: 30_000.00, note: "Guard House: cost" },
  { code: "2030/0100", credit: 16_028.00, note: "Guard House: accum depn" },
  { code: "2040/0000", debit: 203_917.00, note: "Pond: cost" },
  { code: "2040/0100", credit: 203_916.00, note: "Pond: accum depn" },
  { code: "4000/0000", credit: 15_415.92, note: "Trade Creditor: Valiant Force Sdn Bhd" },
  // Opening Bal Equity 542,072.57 + Retained Earnings 42,258.69 + 2025 surplus 5,052.39
  { code: "1000/0000", credit: 589_383.65, note: "Accumulated Fund" },
];

const CREDITORS: { name: string; code: string; amount: number }[] = [
  { name: "Valiant Force Sdn Bhd", code: "4000/001", amount: 15_415.92 },
];

function parseDebtorBF(path: string) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const ROW = /^\s*(\d{1,3})\s+(1\/\d{1,2})\s+([0-9]{1,3}[A-Z]?)\s+(.+)$/;
  // The money columns are the trailing run of numbers; B/F is the first of them.
  const TAIL = /((?:\s+-?[\d,]+(?:\.\d{2})?)+)\s*$/;

  const byUnit = new Map<string, number>();
  for (const line of lines) {
    const m = line.match(ROW);
    if (!m) continue;
    const [, , jalan, unit, rest] = m;
    const t = rest.match(TAIL);
    if (!t) continue;
    const nums = t[1].trim().split(/\s+/);
    if (nums.length < 3) continue;
    const bf = Number(nums[0].replace(/,/g, ""));
    if (!Number.isFinite(bf)) continue;
    // A unit can be listed more than once (previous and current owners); the unit
    // owes the sum of those periods.
    const key = `No ${unit}, Jln ${jalan}`;
    byUnit.set(key, (byUnit.get(key) ?? 0) + bf);
  }
  return byUnit;
}

async function main() {
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // ---------------------------------------------------------------- GL
  const accounts = await db.account.findMany({ where: { associationId: ASSOC } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  const lines: { accountId: string; debit: string; credit: string; lineNo: number }[] = [];
  let n = 0;
  for (const row of GL) {
    const acc = byCode.get(row.code);
    if (!acc) throw new Error(`Account ${row.code} (${row.note}) not in the chart of accounts`);
    lines.push({
      accountId: acc.id,
      debit: (row.debit ?? 0).toFixed(2),
      credit: (row.credit ?? 0).toFixed(2),
      lineNo: ++n,
    });
  }

  const totalDr = r2(GL.reduce((s, r) => s + (r.debit ?? 0), 0));
  const totalCr = r2(GL.reduce((s, r) => s + (r.credit ?? 0), 0));
  if (totalDr !== totalCr) {
    throw new Error(`GL opening does not balance: Dr ${totalDr} vs Cr ${totalCr}`);
  }

  const existing = await db.journalEntry.findFirst({
    where: { associationId: ASSOC, source: "opening" },
  });
  if (existing) {
    await db.journalLine.deleteMany({ where: { entryId: existing.id } });
    await db.journalEntry.update({
      where: { id: existing.id },
      data: { date: OPENING_DATE, lines: { create: lines } },
    });
    console.log(`Replaced opening entry ${existing.entryNo}`);
  } else {
    const last = await db.journalEntry.findFirst({
      where: { associationId: ASSOC, entryNo: { startsWith: "JE-" } },
      orderBy: { entryNo: "desc" },
      select: { entryNo: true },
    });
    const seq = last ? parseInt(last.entryNo.slice(-5), 10) + 1 : 1;
    const entryNo = `JE-${OPENING_DATE.getFullYear()}-${String(seq).padStart(5, "0")}`;
    await db.journalEntry.create({
      data: {
        associationId: ASSOC,
        entryNo,
        date: OPENING_DATE,
        description: "Opening balances brought forward",
        status: "POSTED",
        source: "opening",
        postedAt: new Date(),
        lines: { create: lines },
      },
    });
    console.log(`Created opening entry ${entryNo}`);
  }
  await db.association.update({
    where: { id: ASSOC },
    data: { openingDate: OPENING_DATE },
  });
  console.log(`GL opening balances: ${lines.length} accounts, ${totalDr.toFixed(2)} each side`);

  // ---------------------------------------------------------------- Debtors
  const bf = parseDebtorBF(SOURCE);
  const residents = await db.resident.findMany({
    where: { associationId: ASSOC },
    select: { id: true, unitAddress: true, debtorCode: true },
  });

  await db.paymentAllocation.deleteMany({
    where: { charge: { associationId: ASSOC, isOpeningBalance: true } },
  });
  await db.charge.deleteMany({ where: { associationId: ASSOC, isOpeningBalance: true } });
  await db.receipt.deleteMany({ where: { associationId: ASSOC, isOpeningBalance: true } });

  let owing = 0, advance = 0, zero = 0, unmatched = 0, sum = 0;
  for (const r of residents) {
    const amount = bf.get(r.unitAddress);
    if (amount === undefined) { unmatched++; continue; }
    sum = r2(sum + amount);
    const key = r.debtorCode ?? r.unitAddress;
    if (amount === 0) { zero++; continue; }
    if (amount > 0) {
      await db.charge.create({
        data: {
          associationId: ASSOC,
          residentId: r.id,
          invoiceNo: `BF-${key}`,
          periodMonth: 12,
          periodYear: 2025,
          amount: amount.toFixed(2),
          description: "Balance brought forward",
          date: OPENING_DATE,
          isOpeningBalance: true,
        },
      });
      owing++;
    } else {
      await db.receipt.create({
        data: {
          associationId: ASSOC,
          receiptNo: `BF-${key}`,
          residentId: r.id,
          date: OPENING_DATE,
          amount: Math.abs(amount).toFixed(2),
          method: "BF",
          isOpeningBalance: true,
        },
      });
      advance++;
    }
  }
  console.log(
    `Debtor b/f: ${owing} owing, ${advance} in credit, ${zero} nil, ${unmatched} not on the list — total ${sum.toFixed(2)}`,
  );

  // ---------------------------------------------------------------- Creditors
  const ap = byCode.get("4000/0000");
  if (!ap) throw new Error("Account 4000/0000 (Payables) not found");

  for (const c of CREDITORS) {
    let supplier = await db.supplier.findFirst({ where: { associationId: ASSOC, name: c.name } });
    if (!supplier) {
      supplier = await db.supplier.create({
        data: { associationId: ASSOC, name: c.name, creditorCode: c.code },
      });
      console.log(`Created supplier ${c.name} (${c.code})`);
    } else if (!supplier.creditorCode) {
      supplier = await db.supplier.update({
        where: { id: supplier.id },
        data: { creditorCode: c.code },
      });
    }

    await db.bill.deleteMany({ where: { supplierId: supplier.id, isOpeningBalance: true } });
    await db.bill.create({
      data: {
        associationId: ASSOC,
        supplierId: supplier.id,
        invoiceNo: `BF-${supplier.creditorCode ?? c.name}`,
        date: OPENING_DATE,
        amount: c.amount.toFixed(2),
        expenseAccountId: ap.id,
        status: "UNPAID",
        isOpeningBalance: true,
      },
    });
    console.log(`Creditor b/f: ${c.name} ${c.amount.toFixed(2)}`);
  }
}

main().finally(() => db.$disconnect());
