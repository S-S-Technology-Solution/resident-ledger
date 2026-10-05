"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Receipt,
  CreditCard,
  Truck,
  FileText,
  BookOpen,
  ScrollText,
  BarChart3,
  Menu,
  Settings,
  Wallet,
  Layers,
  Scale,
  CalendarCheck,
  UsersRound,
  Upload,
  SlidersHorizontal,
  FileSpreadsheet,
  FilePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { screenForPath, type ScreenKey } from "@/lib/screens";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

type Item = { href: string; label: string; screen: ScreenKey; icon: React.ComponentType<{ className?: string }> };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/", screen: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/drafts", screen: "drafts", label: "Drafts to post", icon: FilePen },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/residents", screen: "residents", label: "Residents", icon: Users },
      { href: "/charges", screen: "charges", label: "Charges", icon: CreditCard },
      { href: "/receipts", screen: "receipts", label: "Receipts", icon: Receipt },
    ],
  },
  {
    title: "Purchases",
    items: [
      { href: "/suppliers", screen: "suppliers", label: "Suppliers", icon: Truck },
      { href: "/bills", screen: "bills", label: "Bills", icon: FileText },
    ],
  },
  {
    title: "Ledger",
    items: [
      { href: "/accounts", screen: "accounts", label: "Chart of Accounts", icon: BookOpen },
      { href: "/cash-book", screen: "cash-book", label: "Cash Book", icon: Wallet },
      { href: "/journal", screen: "journal", label: "Journal", icon: ScrollText },
      { href: "/batches", screen: "batches", label: "Batches", icon: Layers },
      { href: "/bank-statements", screen: "bank-statements", label: "Bank Statements", icon: FileSpreadsheet },
    ],
  },
  { title: "Reports", items: [{ href: "/reports", screen: "reports", label: "All Reports", icon: BarChart3 }] },
  {
    title: "System",
    items: [
      { href: "/opening-balances", screen: "opening-balances", label: "Opening Balances", icon: Scale },
      { href: "/year-end", screen: "year-end", label: "Year End Closing", icon: CalendarCheck },
      { href: "/settings/users", screen: "users", label: "Users", icon: UsersRound },
      { href: "/settings/defaults", screen: "control-accounts", label: "Control Accounts", icon: SlidersHorizontal },
      { href: "/settings/import", screen: "import", label: "Import Data", icon: Upload },
      { href: "/settings", screen: "settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavBody({ allowed, onNavigate }: { allowed: ScreenKey[]; onNavigate?: () => void }) {
  const path = usePathname();
  const current = screenForPath(path);
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.screen)) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border"
      >
        <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
          R
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">ResidentLedger</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Accounting</div>
        </div>
      </Link>
      <nav className="flex-1 flex flex-col overflow-y-auto px-3 py-4 space-y-6">
        {visible.map((g) => (
          <div
            key={g.title}
            className={cn("space-y-1", g.title === "System" && "mt-auto")}
          >
            <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {g.title}
            </div>
            {g.items.map((item) => {
              const active = current === item.screen;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

export function DesktopSidebar({ allowed }: { allowed: ScreenKey[] }) {
  return (
    <aside className="hidden lg:flex sticky top-0 h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border no-print">
      <NavBody allowed={allowed} />
    </aside>
  );
}

export function MobileMenuButton({ allowed }: { allowed: ScreenKey[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted no-print"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <NavBody allowed={allowed} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
