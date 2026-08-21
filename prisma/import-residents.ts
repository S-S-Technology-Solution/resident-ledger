import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const ASSOC = "default";
const MONTHLY_FEE = "120";
const SOURCE = process.argv[2] ?? "/tmp/tscra.txt";

// Debtor ledger rows: street + odd/even unit numbers -> row letter.
// Codes are 3000/<letter><unit no, 2-digit><suffix>, e.g. No 1 Jln 1/2 -> 3000/A01,
// No 12A Jln 1/4 -> 3000/B12A. All control to G/L 3000/0000 (Residents account).
const ROW_LETTER: Record<string, { odd: string; even: string }> = {
  "1/2": { odd: "A", even: "A" },
  "1/4": { odd: "C", even: "B" },
  "1/6": { odd: "E", even: "D" },
  "1/8": { odd: "G", even: "F" },
  "1/10": { odd: "I", even: "H" },
};

function debtorCode(jalan: string, unit: string): string | null {
  const m = unit.match(/^(\d{1,3})([A-Z]?)$/);
  const row = ROW_LETTER[jalan];
  if (!m || !row) return null;
  const num = parseInt(m[1], 10);
  const letter = num % 2 === 1 ? row.odd : row.even;
  return `3000/${letter}${String(num).padStart(2, "0")}${m[2]}`;
}

type Row = { no: number; jalan: string; unit: string; name: string; phone: string | null };

function parse(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const rows: Row[] = [];
  // Match: leading spaces, No, Jalan (1/N), Unit (alphanumeric), rest
  const RE = /^\s*(\d{1,3})\s+(1\/\d{1,2})\s+([0-9]{1,3}[A-Z]?)\s+(.+)$/;
  const PHONE = /\b(01[0-9][\s\-]?\d{3,4}[\s\-\/]?\d{3,4}(?:\s*\/\s*01[0-9][\s\-]?\d{3,4}[\s\-\/]?\d{3,4})?)\b/;
  const TRAILING_NUM = /\s+-?[\d,]+(?:\s+-?[\d,]+){0,3}\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RE);
    if (!m) continue;
    const [, no, jalan, unit, rest] = m;
    let body = rest;

    // If body doesn't yet contain a phone but next line has a stray phone-only fragment,
    // pull it in (covers wraps like row 9 / row 33 / row 139).
    if (!PHONE.test(body) && lines[i + 1]) {
      const next = lines[i + 1].trim();
      if (PHONE.test(next) && !RE.test(lines[i + 1])) {
        body = `${body} ${next}`;
      }
    }

    const phoneM = body.match(PHONE);
    const phone = phoneM ? phoneM[1].replace(/\s+/g, "") : null;
    let name = body
      .replace(PHONE, "")
      .replace(TRAILING_NUM, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    // Strip trailing stray slashes/dashes left over
    name = name.replace(/[\s\/\-]+$/, "").trim();

    rows.push({ no: parseInt(no, 10), jalan, unit, name, phone });
  }
  return rows;
}

async function main() {
  const text = readFileSync(SOURCE, "utf8");
  const rows = parse(text);
  console.log(`Parsed ${rows.length} rows from ${SOURCE}`);

  // A unit can appear more than once (previous vs current owner) — the last row wins.
  const byUnit = new Map<string, Row>();
  for (const r of rows) byUnit.set(`No ${r.unit}, Jln ${r.jalan}`, r);
  console.log(`${byUnit.size} unique units`);

  let created = 0, updated = 0;
  for (const [unitAddress, r] of byUnit) {
    const code = debtorCode(r.jalan, r.unit);
    const data = {
      ownerName: r.name,
      phone: r.phone,
      debtorCode: code,
      active: true,
    };
    const existing = await db.resident.findFirst({ where: { associationId: ASSOC, unitAddress } });
    if (existing) {
      await db.resident.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await db.resident.create({
        data: { associationId: ASSOC, unitAddress, monthlyFee: MONTHLY_FEE, ...data },
      });
      created++;
    }
  }

  // Remove residents no longer on the list: delete when they have no history,
  // otherwise deactivate (charges/receipts must keep their FK target).
  const stale = await db.resident.findMany({
    where: { associationId: ASSOC, unitAddress: { notIn: [...byUnit.keys()] } },
    include: { _count: { select: { charges: true, receipts: true } } },
  });
  let deleted = 0, deactivated = 0;
  for (const s of stale) {
    if (s._count.charges === 0 && s._count.receipts === 0) {
      await db.resident.delete({ where: { id: s.id } });
      deleted++;
    } else {
      await db.resident.update({ where: { id: s.id }, data: { active: false, debtorCode: null } });
      deactivated++;
      console.log(`Deactivated (has history): ${s.unitAddress} — ${s.ownerName}`);
    }
  }

  console.log(`Done. Created ${created}, updated ${updated}, deleted ${deleted}, deactivated ${deactivated}.`);
}

main().finally(() => db.$disconnect());
