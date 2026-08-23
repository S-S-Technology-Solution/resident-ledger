import { db } from "./db";
import { DEFAULT_ASSOCIATION_ID } from "./association";

/**
 * Control accounts — the accounts the system posts to automatically.
 *
 * Each role resolves to an account code held on the association, falling back to
 * the built-in default when it has never been set. Holding a code rather than an
 * id means the chart of accounts can be reloaded without orphaning the mapping.
 */

const FALLBACK = {
  AR: "3000/0000",
  INCOME_FEE: "5000/0001",
  BANK: "3300/0000",
  CASH: "3300/0010",
  AP: "4000/0000",
} as const;

export type ControlAccountKey = keyof typeof FALLBACK;

export const CONTROL_KEYS = Object.keys(FALLBACK) as ControlAccountKey[];

export const CONTROL_LABEL: Record<ControlAccountKey, string> = {
  AR: "Residents control (debtors)",
  INCOME_FEE: "Fee income",
  BANK: "Bank",
  CASH: "Cash",
  AP: "Payables control (creditors)",
};

export const CONTROL_DESCRIPTION: Record<ControlAccountKey, string> = {
  AR: "Debited when an invoice is raised, credited when a receipt is taken",
  INCOME_FEE: "Credited when an invoice is raised",
  BANK: "Debited or credited for anything settled by bank",
  CASH: "Debited or credited for anything settled in cash",
  AP: "Credited when a bill is entered, debited when it is paid",
};

/** Which association column holds each role's override. */
const COLUMN: Record<ControlAccountKey, "ctlAr" | "ctlIncomeFee" | "ctlBank" | "ctlCash" | "ctlAp"> = {
  AR: "ctlAr",
  INCOME_FEE: "ctlIncomeFee",
  BANK: "ctlBank",
  CASH: "ctlCash",
  AP: "ctlAp",
};

export async function controlAccountCodes(associationId = DEFAULT_ASSOCIATION_ID) {
  const assoc = await db.association.findUnique({
    where: { id: associationId },
    select: { ctlAr: true, ctlIncomeFee: true, ctlBank: true, ctlCash: true, ctlAp: true },
  });
  return Object.fromEntries(
    CONTROL_KEYS.map((k) => [k, assoc?.[COLUMN[k]] || FALLBACK[k]]),
  ) as Record<ControlAccountKey, string>;
}

export async function controlAccount(
  key: ControlAccountKey,
  associationId = DEFAULT_ASSOCIATION_ID,
) {
  const codes = await controlAccountCodes(associationId);
  const code = codes[key];
  const account = await db.account.findUnique({
    where: { associationId_code: { associationId, code } },
  });
  if (!account) {
    throw new Error(
      `Control account ${CONTROL_LABEL[key]} points at ${code}, which is not in the chart of accounts. Set it under Settings › Control Accounts.`,
    );
  }
  if (!account.active) {
    throw new Error(
      `Control account ${CONTROL_LABEL[key]} points at ${code}, which is deactivated. Reactivate it or pick another under Settings › Control Accounts.`,
    );
  }
  return account;
}

export async function paymentMethodAccount(method: "CASH" | "BANK") {
  return controlAccount(method === "CASH" ? "CASH" : "BANK");
}

/** Codes the system depends on, so the chart of accounts screen can protect them. */
export async function reservedAccountCodes(associationId = DEFAULT_ASSOCIATION_ID) {
  return new Set(Object.values(await controlAccountCodes(associationId)));
}
