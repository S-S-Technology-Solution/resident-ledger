import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const ASSOC = "default";
const MONTHLY_FEE = "120";
const SOURCE = process.argv[2] ?? "/tmp/tscra.txt";

type Row = { no: number; jalan: string; unit: string; name: string; phone: string | null };

function parse(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const rows: Row[] = [];
  // Match: leading spaces, No, Jalan (1/N), Unit (alphanumeric), rest
  const RE = /^\s*(\d{1,3})\s+(1\/\d{1,2})\s+([0-9]{1,3}[A-Z]?)\s+(.+)$/;
  const PHONE = /\b(01[0-9][\s\-]?\d{3,4}[\s\-\/]?\d{3,4}(?:\s*\/\s*01[0-9][\s\-]?\d{3,4}[\s\-\/]?\d{3,4})?)\b/;
  const TRAILING_NUM = /\s+[\d,]+(?:\s+[\d,]+){0,2}\s*$/;

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
  console.log(`Parsed ${rows.length} residents from ${SOURCE}`);

  let created = 0, updated = 0;
  for (const r of rows) {
    const unitAddress = `No ${r.unit}, Jln ${r.jalan}`;
    const existing = await db.resident.findFirst({
      where: { associationId: ASSOC, unitAddress },
    });
    if (existing) {
      await db.resident.update({
        where: { id: existing.id },
        data: { ownerName: r.name, phone: r.phone, active: true },
      });
      updated++;
    } else {
      await db.resident.create({
        data: {
          associationId: ASSOC,
          unitAddress,
          ownerName: r.name,
          phone: r.phone,
          monthlyFee: MONTHLY_FEE,
          active: true,
        },
      });
      created++;
    }
  }

  console.log(`Done. Created ${created}, updated ${updated}.`);
}

main().finally(() => db.$disconnect());
