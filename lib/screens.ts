/**
 * The screens a user can be given access to — one per menu item. Shared by the
 * server (page checks) and the browser (menu, user editor), so it holds no
 * server imports.
 *
 * Administrators always see every screen. Anyone else sees either all screens
 * or only the ones ticked for them in Settings › Users. What they may *do* on a
 * screen is still decided by their role: a view-only user can open a screen
 * but never post from it.
 */
export type ScreenKey =
  | "dashboard" | "drafts" | "residents" | "charges" | "receipts" | "suppliers" | "bills"
  | "accounts" | "cash-book" | "journal" | "batches" | "bank-statements" | "reports"
  | "opening-balances" | "year-end" | "users" | "control-accounts" | "import" | "settings";

export type Screen = { key: ScreenKey; label: string; group: string; href: string; prefixes: string[] };

export const SCREENS: Screen[] = [
  { key: "dashboard", label: "Dashboard", group: "Overview", href: "/", prefixes: [] },
  { key: "drafts", label: "Drafts to post", group: "Overview", href: "/drafts", prefixes: ["/drafts"] },
  { key: "residents", label: "Residents", group: "Sales", href: "/residents", prefixes: ["/residents"] },
  { key: "charges", label: "Charges", group: "Sales", href: "/charges", prefixes: ["/charges"] },
  { key: "receipts", label: "Receipts", group: "Sales", href: "/receipts", prefixes: ["/receipts"] },
  { key: "suppliers", label: "Suppliers", group: "Purchases", href: "/suppliers", prefixes: ["/suppliers"] },
  { key: "bills", label: "Bills", group: "Purchases", href: "/bills", prefixes: ["/bills", "/cheque"] },
  { key: "accounts", label: "Chart of Accounts", group: "Ledger", href: "/accounts", prefixes: ["/accounts"] },
  { key: "cash-book", label: "Cash Book", group: "Ledger", href: "/cash-book", prefixes: ["/cash-book"] },
  { key: "journal", label: "Journal", group: "Ledger", href: "/journal", prefixes: ["/journal"] },
  { key: "batches", label: "Batches", group: "Ledger", href: "/batches", prefixes: ["/batches"] },
  { key: "bank-statements", label: "Bank Statements", group: "Ledger", href: "/bank-statements", prefixes: ["/bank-statements", "/reconciliation"] },
  { key: "reports", label: "Reports", group: "Reports", href: "/reports", prefixes: ["/reports", "/api/export"] },
  { key: "opening-balances", label: "Opening Balances", group: "System", href: "/opening-balances", prefixes: ["/opening-balances"] },
  { key: "year-end", label: "Year End Closing", group: "System", href: "/year-end", prefixes: ["/year-end"] },
  { key: "users", label: "Users", group: "System", href: "/settings/users", prefixes: ["/settings/users"] },
  { key: "control-accounts", label: "Control Accounts", group: "System", href: "/settings/defaults", prefixes: ["/settings/defaults"] },
  { key: "import", label: "Import Data", group: "System", href: "/settings/import", prefixes: ["/settings/import"] },
  { key: "settings", label: "Settings", group: "System", href: "/settings", prefixes: ["/settings"] },
];

export const SCREEN_KEYS = SCREENS.map((s) => s.key);

export type ScreenAccess = { role: string; allScreens: boolean; screens: string[] };

export function canSeeScreen(user: ScreenAccess, key: ScreenKey) {
  return user.role === "ADMIN" || user.allScreens || user.screens.includes(key);
}

/**
 * The reports on the Reports screen. The key is the folder under /reports and
 * the export slug. A user with the Reports screen sees every report unless
 * particular ones are ticked for them, held in `screens` as "report:<key>".
 */
export type Report = { key: string; title: string; description: string; group: string; href: string };

export const REPORTS: Report[] = [
  { key: "trial-balance", group: "Ledger", href: "/reports/trial-balance", title: "Trial Balance", description: "Debits and credits across all accounts for a period." },
  { key: "general-ledger", group: "Ledger", href: "/reports/general-ledger", title: "General Ledger", description: "Posted transactions and running balance for an account." },
  { key: "cash-book", group: "Ledger", href: "/reports/cash-book", title: "Cash Book", description: "Bank and cash movements with running balance, per account." },
  { key: "cash-flow", group: "Ledger", href: "/reports/cash-flow", title: "Cash Flow Statement", description: "Where cash came from and went, between two dates." },
  { key: "twelve-month", group: "Ledger", href: "/reports/twelve-month", title: "12-Month Transaction Summary", description: "Sales, purchases, receipts and payments month by month." },
  { key: "account-range", group: "Ledger", href: "/reports/account-range", title: "Range of Accounts", description: "Chart of accounts with balances, between two account codes." },
  { key: "profit-loss", group: "Profit & Loss", href: "/reports/profit-loss", title: "Profit & Loss", description: "Income and expenses with net result for a period." },
  { key: "balance-sheet", group: "Balance Sheet", href: "/reports/balance-sheet", title: "Balance Sheet", description: "Assets, liabilities and equity as of a date." },
  { key: "fixed-assets", group: "Balance Sheet", href: "/reports/fixed-assets", title: "Fixed Assets", description: "Cost less accumulated depreciation, with net book value." },
  { key: "ar-ageing", group: "Receivables (AR)", href: "/reports/ar-ageing", title: "A/R Ageing Summary", description: "Outstanding resident balances bucketed by age." },
  { key: "collection", group: "Receivables (AR)", href: "/reports/collection", title: "Collection Report", description: "Billed vs collected per resident for a period." },
  { key: "payment-history", group: "Receivables (AR)", href: "/reports/payment-history", title: "Payment History (per Resident)", description: "All receipts and allocations for a single resident." },
  { key: "debtor-ledger", group: "Receivables (AR)", href: "/reports/debtor-ledger?kind=debtor", title: "Debtor / Creditor Ledger", description: "Every invoice and payment for one resident or supplier, with a running balance." },
  { key: "invoice-listing", group: "Receivables (AR)", href: "/reports/invoice-listing?view=unpaid", title: "Invoice Listing", description: "Unpaid, paid, and invoices falling due — switchable in one place." },
  { key: "sales-report", group: "Receivables (AR)", href: "/reports/sales-report", title: "Debtors Sales Report", description: "What was invoiced to each resident, and how much has been settled." },
  { key: "ap-ageing", group: "Payables (AP)", href: "/reports/ap-ageing", title: "A/P Ageing", description: "Open supplier bills bucketed by age." },
  { key: "expense-by-category", group: "Payables (AP)", href: "/reports/expense-by-category", title: "Expense by Category", description: "Posted expenses grouped by chart-of-accounts category." },
  { key: "expense-by-supplier", group: "Payables (AP)", href: "/reports/expense-by-supplier", title: "Expense by Supplier", description: "Total billed amounts grouped by supplier." },
  { key: "bill-listing", group: "Payables (AP)", href: "/reports/bill-listing?view=unpaid", title: "Bill Listing", description: "Unpaid, paid, and bills falling due — switchable in one place." },
  { key: "remittance-advice", group: "Payables (AP)", href: "/reports/remittance-advice", title: "Remittance Advice", description: "Which invoices a payment settled, to send on to the supplier." },
  { key: "creditor-payments", group: "Payables (AP)", href: "/reports/creditor-payments", title: "Creditor Payments", description: "Every payment made to suppliers over a period." },
  { key: "batch-transactions", group: "Batches", href: "/reports/batch-transactions", title: "Batch of Transactions", description: "Everything posted in one monthly batch, in detail or summary." },
  { key: "check-transaction", group: "Enquiry", href: "/reports/check-transaction", title: "Check Transaction", description: "Find a posting by amount, reference, description or date." },
  { key: "audit-trail", group: "Audit", href: "/reports/audit-trail", title: "Audit Trail", description: "Voids, deletions, opening balances and year-end closings." },
];

export const REPORT_KEYS = REPORTS.map((r) => r.key);
export const reportScreen = (key: string) => `report:${key}`;

export function canSeeReport(user: ScreenAccess, key: string) {
  if (!canSeeScreen(user, "reports")) return false;
  if (user.role === "ADMIN" || user.allScreens) return true;
  const picked = user.screens.filter((s) => s.startsWith("report:"));
  return picked.length === 0 || picked.includes(reportScreen(key));
}

/** The screen a path belongs to; the most specific prefix wins (/settings/users before /settings). */
export function screenForPath(pathname: string): ScreenKey | null {
  if (pathname === "/") return "dashboard";
  let best: Screen | null = null;
  for (const s of SCREENS)
    for (const p of s.prefixes)
      if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > Math.max(...best.prefixes.map((x) => x.length))))
        best = s;
  return best?.key ?? null;
}

/** Where to send a user who lands somewhere they can't see: their first screen. */
export function homeFor(user: ScreenAccess) {
  return SCREENS.find((s) => canSeeScreen(user, s.key))?.href ?? "/account/change-password";
}
