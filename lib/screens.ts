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
