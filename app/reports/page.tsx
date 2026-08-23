import Link from "next/link";
import { ChevronRight, BookOpen, TrendingUp, Scale, ArrowDownRight, ArrowUpRight, Layers, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

type Item = { href: string; title: string; description: string };
type Section = { title: string; icon: LucideIcon; items: Item[] };

const sections: Section[] = [
  {
    title: "Ledger",
    icon: BookOpen,
    items: [
      { href: "/reports/trial-balance", title: "Trial Balance", description: "Debits and credits across all accounts for a period." },
      { href: "/reports/general-ledger", title: "General Ledger", description: "Posted transactions and running balance for an account." },
      { href: "/reports/cash-book", title: "Cash Book", description: "Bank and cash movements with running balance, per account." },
      { href: "/reports/cash-flow", title: "Cash Flow Statement", description: "Where cash came from and went, between two dates." },
      { href: "/reports/twelve-month", title: "12-Month Transaction Summary", description: "Sales, purchases, receipts and payments month by month." },
    ],
  },
  {
    title: "Profit & Loss",
    icon: TrendingUp,
    items: [
      { href: "/reports/profit-loss", title: "Profit & Loss", description: "Income and expenses with net result for a period." },
    ],
  },
  {
    title: "Balance Sheet",
    icon: Scale,
    items: [
      { href: "/reports/balance-sheet", title: "Balance Sheet", description: "Assets, liabilities and equity as of a date." },
    ],
  },
  {
    title: "Receivables (AR)",
    icon: ArrowDownRight,
    items: [
      { href: "/reports/ar-ageing", title: "A/R Ageing Summary", description: "Outstanding resident balances bucketed by age." },
      { href: "/reports/collection", title: "Collection Report", description: "Billed vs collected per resident for a period." },
      { href: "/reports/payment-history", title: "Payment History (per Resident)", description: "All receipts and allocations for a single resident." },
      { href: "/reports/debtor-ledger?kind=debtor", title: "Debtor Ledger", description: "Every invoice and payment for one resident, with a running balance." },
    ],
  },
  {
    title: "Payables (AP)",
    icon: ArrowUpRight,
    items: [
      { href: "/reports/ap-ageing", title: "A/P Ageing", description: "Open supplier bills bucketed by age." },
      { href: "/reports/expense-by-category", title: "Expense by Category", description: "Posted expenses grouped by chart-of-accounts category." },
      { href: "/reports/expense-by-supplier", title: "Expense by Supplier", description: "Total billed amounts grouped by supplier." },
      { href: "/reports/debtor-ledger?kind=creditor", title: "Creditor Ledger", description: "Every invoice and payment for one supplier, with a running balance." },
      { href: "/reports/bill-listing?view=unpaid", title: "Bill Listing", description: "Unpaid, paid, and bills falling due — switchable in one place." },
      { href: "/reports/remittance-advice", title: "Remittance Advice", description: "Which invoices a payment settled, to send on to the supplier." },
    ],
  },
  {
    title: "Batches",
    icon: Layers,
    items: [
      { href: "/reports/batch-transactions", title: "Batch of Transactions", description: "Everything posted in one monthly batch, in detail or summary." },
    ],
  },
  {
    title: "Audit",
    icon: ShieldCheck,
    items: [
      { href: "/reports/audit-trail", title: "Audit Trail", description: "Voids, deletions, opening balances and year-end closings." },
    ],
  },
];

export default function ReportsIndex() {
  return (
    <div className="space-y-8">
      <PageHeader title="Reports" />
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <section key={section.title} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="group">
                  <Card className="h-full transition-colors hover:border-foreground/20 hover:bg-accent/40">
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{item.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
