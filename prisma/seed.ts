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
};

const COA: Seed[] = [
  // Assets — 1xxx
  { code: "1000", name: "RHB Bank Berhad",                  type: "ASSET", normalSide: "DEBIT" },
  { code: "1010", name: "Cash In Hand",                     type: "ASSET", normalSide: "DEBIT" },
  { code: "1020", name: "Undeposited Funds",                type: "ASSET", normalSide: "DEBIT" },
  { code: "1100", name: "Residents Account (AR)",           type: "ASSET", normalSide: "DEBIT" },
  { code: "1500", name: "Electrical & Equipment - Cost",    type: "ASSET", normalSide: "DEBIT" },
  { code: "1501", name: "Electrical & Equipment - Accum Deprn", type: "ASSET", normalSide: "CREDIT" },
  { code: "1510", name: "Fittings & Signage - Cost",        type: "ASSET", normalSide: "DEBIT" },
  { code: "1511", name: "Fittings & Signage - Accum Deprn", type: "ASSET", normalSide: "CREDIT" },
  { code: "1520", name: "Guard House - Cost",               type: "ASSET", normalSide: "DEBIT" },
  { code: "1521", name: "Guard House - Accum Deprn",        type: "ASSET", normalSide: "CREDIT" },
  { code: "1530", name: "Pond - Cost",                      type: "ASSET", normalSide: "DEBIT" },
  { code: "1531", name: "Pond - Accum Deprn",               type: "ASSET", normalSide: "CREDIT" },

  // Liabilities — 2xxx
  { code: "2000", name: "Trade Creditor",                   type: "LIABILITY", normalSide: "CREDIT" },
  { code: "2100", name: "Accruals",                         type: "LIABILITY", normalSide: "CREDIT" },

  // Equity — 3xxx
  { code: "3000", name: "Opening Balance Equity",           type: "EQUITY", normalSide: "CREDIT" },
  { code: "3100", name: "Retained Earnings",                type: "EQUITY", normalSide: "CREDIT" },

  // Income — 4xxx
  { code: "4000", name: "Security & Maintenance Fee",       type: "INCOME", normalSide: "CREDIT" },
  { code: "4900", name: "Contribution",                     type: "INCOME", normalSide: "CREDIT" },

  // Expense — 5xxx
  { code: "5000", name: "Security Fees",                    type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5010", name: "Services Tax",                     type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5020", name: "Electricity",                      type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5030", name: "Gardener's Wages",                 type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5040", name: "Upkeep & Maintenance",             type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5050", name: "Meeting Expenses",                 type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5060", name: "Refreshment",                      type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5070", name: "Printing & Stationery",            type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5080", name: "Travelling",                       type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5090", name: "Chairman's Allowance",             type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5091", name: "Treasurer's Allowance",            type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5100", name: "Accounting Fees",                  type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5110", name: "Bank Charges",                     type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5200", name: "Depreciation",                     type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5300", name: "Bad Debt Written Off",             type: "EXPENSE", normalSide: "DEBIT" },
  { code: "5400", name: "Over Provision",                   type: "EXPENSE", normalSide: "CREDIT" },
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

  for (const a of COA) {
    await db.account.upsert({
      where: { associationId_code: { associationId: assoc.id, code: a.code } },
      update: { name: a.name, type: a.type, normalSide: a.normalSide },
      create: { ...a, associationId: assoc.id },
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
