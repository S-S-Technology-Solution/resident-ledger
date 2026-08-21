import "dotenv/config";
import { PrismaClient, AccountType, NormalSide } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

type Seed = {
  code: string;
  name: string;
  type: AccountType;
  normalSide: NormalSide;
  group: string;
  classifiedAs?: string | null;
  parentCode?: string;
};

// Source: COA.xlsx (TSCRA chart of accounts, Aug 2026).
// Expenditure codes use a 3-digit suffix (e.g. "90B1/000") as in the sheet.
const COA: Seed[] = [
  // Capital & Reserves
  { code: "1000/0000", name: "Accumulated Fund",                          type: "EQUITY",    normalSide: "CREDIT", group: "Capital & Reserves",  classifiedAs: "C1" },
  { code: "1001/0000", name: "Surplus /(deficit) for the year",           type: "EQUITY",    normalSide: "CREDIT", group: "Capital & Reserves",  classifiedAs: "C2" },

  // Fixed Assets
  { code: "2000/0000", name: "Plant and equipment",                       type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2010/0000", name: "Electrical & equipment",                    type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2010/0100", name: "Accum depn - Electrical & equipment",       type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD", parentCode: "2010/0000" },
  { code: "2020/0000", name: "Fittings & signage",                        type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2020/0100", name: "Accum depn - Fittings & signage",           type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD", parentCode: "2020/0000" },
  { code: "2030/0000", name: "Guard house",                               type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2030/0100", name: "Accum depn - Guard house",                  type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD", parentCode: "2030/0000" },
  { code: "2040/0000", name: "Pond",                                      type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2040/0100", name: "Accum depn - Pond",                         type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD", parentCode: "2040/0000" },

  // Current Assets
  { code: "3000/0000", name: "Residents account",                         type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "DR" },
  { code: "3200/0000", name: "Deposits and prepayment account",           type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3300/0000", name: "RHB bank",                                  type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "B" },
  { code: "3300/0010", name: "Cash",                                      type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "C" },

  // Current Liabilities
  { code: "4000/0000", name: "Payables",                                  type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities", classifiedAs: "CR" },
  { code: "4100/0000", name: "Sundry payables",                           type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities", classifiedAs: "CR" },
  { code: "4300/0000", name: "Accruals",                                  type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },

  // Revenue
  { code: "5000/0000", name: "INCOME",                                    type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5000/0001", name: "Security fees",                             type: "INCOME",    normalSide: "CREDIT", group: "Revenue",             classifiedAs: "S" },
  { code: "5000/0002", name: "Car stickers",                              type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5000/0003", name: "TSCRA Membership fee",                      type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5100/0000", name: "OTHER INCOME",                              type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5100/0001", name: "Contributions",                             type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },

  // Direct cost
  { code: "6000/0000", name: "COST OF INCOME",                            type: "EXPENSE",   normalSide: "DEBIT",  group: "Direct cost" },
  { code: "6000/0001", name: "Security guard services",                   type: "EXPENSE",   normalSide: "DEBIT",  group: "Direct cost",         classifiedAs: "P" },
  { code: "6000/0002", name: "Security & maintenance",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Direct cost" },
  { code: "6000/0003", name: "CCTV maintenance",                          type: "EXPENSE",   normalSide: "DEBIT",  group: "Direct cost" },

  // Expenditure
  { code: "9000/0000", name: "ADMINISTRATIVE EXPENSES",                   type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90B1/000",  name: "Bank charges",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90C1/000",  name: "Committee meeting expenses",                type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90D1/000",  name: "Depreciation",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90E1/000",  name: "Electricity charges",                       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90G1/000",  name: "General expenses and maintenance",          type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90P1/000",  name: "Printing & stationery",                     type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/000",  name: "Services tax",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90T1/000",  name: "Travelling expenses",                       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90U1/000",  name: "Upkeep & maintenance",                      type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
];

async function main() {
  const assoc = await db.association.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "Taman Sunway Cheras Residents Association",
      currency: "RM",
      fiscalYearStart: 1,
    },
  });

  const codeToId = new Map<string, string>();
  for (const a of COA) {
    const acc = await db.account.upsert({
      where: { associationId_code: { associationId: assoc.id, code: a.code } },
      update: {
        name: a.name, type: a.type, normalSide: a.normalSide,
        group: a.group, classifiedAs: a.classifiedAs ?? null, active: true,
      },
      create: {
        associationId: assoc.id,
        code: a.code, name: a.name, type: a.type, normalSide: a.normalSide,
        group: a.group, classifiedAs: a.classifiedAs ?? null,
      },
    });
    codeToId.set(a.code, acc.id);
  }
  for (const a of COA) {
    if (!a.parentCode) continue;
    const parentId = codeToId.get(a.parentCode);
    if (!parentId) continue;
    await db.account.update({
      where: { associationId_code: { associationId: assoc.id, code: a.code } },
      data: { parentId },
    });
  }

  const adminEmail = "admin@example.com";
  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Treasurer",
      passwordHash: await bcrypt.hash("changeme", 10),
      associationId: assoc.id,
    },
  });

  console.log(`Seeded ${COA.length} accounts for "${assoc.name}". Admin: ${adminEmail} / changeme`);
}

main().finally(() => db.$disconnect());
