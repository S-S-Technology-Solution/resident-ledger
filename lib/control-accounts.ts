import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

const CODES = {
  AR: "1100",
  INCOME_FEE: "4000",
  BANK: "1000",
  CASH: "1010",
  AP: "2000",
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
