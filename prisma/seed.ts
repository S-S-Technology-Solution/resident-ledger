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

const COA: Seed[] = [
  // Capital & Reserves
  { code: "1000/0000", name: "Sinking Fund",                              type: "EQUITY",    normalSide: "CREDIT", group: "Capital & Reserves" },
  { code: "1200/0000", name: "Accumulated deficit",                       type: "EQUITY",    normalSide: "DEBIT",  group: "Capital & Reserves", classifiedAs: "C1" },
  { code: "1201/0000", name: "Current year Surplus/ (Deficit)",           type: "EQUITY",    normalSide: "CREDIT", group: "Capital & Reserves", classifiedAs: "C2" },

  // Fixed Assets / Plant
  { code: "2000/0000", name: "Plant and equipment",                       type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "FA" },
  { code: "2005/0000", name: "Computer & Software",                       type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2005/0100", name: "Accum Dpn - Computer & software",           type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD" },
  { code: "2006/0000", name: "Office equipment",                          type: "ASSET",     normalSide: "DEBIT",  group: "Fixed Assets",        classifiedAs: "FA" },
  { code: "2006/0100", name: "Accum Dpn- Office equipment",               type: "ASSET",     normalSide: "CREDIT", group: "Fixed Assets",        classifiedAs: "FD" },

  // Current Assets
  { code: "3000/0000", name: "Amount due from unit owners",               type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3020/0000", name: "Amount due from Ronald Shan",               type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3100/0000", name: "Deposits",                                  type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3100/0005", name: "Prepayment",                                type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3100/0010", name: "Expenses recoverable",                      type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3200/0000", name: "Unidentified receipts",                     type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3200/0010", name: "Contra account",                            type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3300/0000", name: "Hong Leong Bank",                           type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "B" },
  { code: "3300/0010", name: "Cash on hand",                              type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets",      classifiedAs: "C" },
  { code: "3300/0030", name: "Petty cash",                                type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },
  { code: "3300/0031", name: "Petty cash- Norhidayu",                     type: "ASSET",     normalSide: "DEBIT",  group: "Current Assets" },

  // Current Liabilities
  { code: "4010/0000", name: "Sundry payable",                            type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },
  { code: "4100/0000", name: "Other payables -deposit",                   type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },
  { code: "4200/0001", name: "Unidentified payments",                     type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },
  { code: "4300/0001", name: "Accruals - Audit fees",                     type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },
  { code: "4300/0005", name: "Accruals - Accounting fees",                type: "LIABILITY", normalSide: "CREDIT", group: "Current Liabilities" },

  // Revenue
  { code: "5000/0000", name: "Income",                                    type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5001/0000", name: "Service charges",                           type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5003/0000", name: "Insurance recoverable from unit owners",    type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5004/0000", name: "Repair and maintenance",                    type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5005/0000", name: "Water charges recoverable from unit owners",type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5008/0000", name: "Quit rent",                                 type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },
  { code: "5015/0000", name: "Other income",                              type: "INCOME",    normalSide: "CREDIT", group: "Revenue" },

  // Expenditure
  { code: "8000/0000", name: "Expenditure",                               type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90A1/0000", name: "Accounting fee",                            type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90A3/0000", name: "Attestation",                               type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90A5/0000", name: "Auditors' remuneration",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90A6/0000", name: "Agreement and stamping fee",                type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90B1/0000", name: "Bank charges",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90C1/0000", name: "Cleaning services",                         type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90D1/0000", name: "Disbursement",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90D2/0000", name: "Debt collection fee",                       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90D3/0000", name: "Depreciation of plant and equipment",       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90E1/0000", name: "Electrical",                                type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90E1/0001", name: "Electricity charges",                       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure", parentCode: "90E1/0000" },
  { code: "90E1/0002", name: "Electrical maintenance",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure", parentCode: "90E1/0000" },
  { code: "90I1/0000", name: "Insurance",                                 type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90M1/0000", name: "Management fees",                           type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90M1/0010", name: "Management meeting allowance",              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90M3/0000", name: "Meeting expenses",                          type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90M4/0000", name: "Medical fees",                              type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90O1/0010", name: "Staff refreshment & welfare",               type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90P1/0000", name: "Postage and courier service",               type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90P1/0005", name: "Printing and stationery",                   type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90P1/0006", name: "Petty cash written off",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90R1/0000", name: "Rental of premises",                        type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90R1/0001", name: "Receivable written off",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90R1/0002", name: "Rental of copier machine",                  type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90R1/0005", name: "Repair and maintenance",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/0000", name: "Salaries and allowance",                    type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/0003", name: "Service tax",                               type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/0010", name: "Sewerage",                                  type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/0012", name: "Sundry expenses",                           type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90S1/0015", name: "Stamp duty",                                type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90T1/0000", name: "Telephone and internet charges",            type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90T5/0000", name: "Theft and lost",                            type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90T8/0000", name: "Travelling expenses",                       type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90U1/0000", name: "Upkeep of office",                          type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90U2/0000", name: "Upkeep of office equipment",                type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90U3/0000", name: "Upkeep of building",                        type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90W1/0000", name: "Water charges",                             type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
  { code: "90W2/0000", name: "Wages",                                     type: "EXPENSE",   normalSide: "DEBIT",  group: "Expenditure" },
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
        group: a.group, classifiedAs: a.classifiedAs ?? null,
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
