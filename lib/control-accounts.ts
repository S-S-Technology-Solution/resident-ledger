import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

const CODES = {
  AR: "3000/0000",
  INCOME_FEE: "5000/0001",
  BANK: "3300/0000",
  CASH: "3300/0010",
  AP: "4000/0000",
} as const;

export type ControlAccountKey = keyof typeof CODES;

export async function controlAccount(key: ControlAccountKey) {
  const code = CODES[key];
  const a = await db.account.findUnique({
    where: { associationId_code: { associationId: DEFAULT_ASSOCIATION_ID, code } },
  });
  if (!a) throw new Error(`Control account ${key} (code ${code}) not found. Re-run db:seed.`);
  return a;
}

export async function paymentMethodAccount(method: "CASH" | "BANK") {
  return controlAccount(method === "CASH" ? "CASH" : "BANK");
}
