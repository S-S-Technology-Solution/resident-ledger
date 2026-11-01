import Link from "next/link";
import { ChevronRight, BookOpen, TrendingUp, Scale, ArrowDownRight, ArrowUpRight, Layers, ShieldCheck, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { requireScreen } from "@/lib/screen-guard";
import { REPORTS, canSeeReport } from "@/lib/screens";

// Section icons; the reports themselves are listed in lib/screens.ts.
const ICONS: Record<string, LucideIcon> = {
  Ledger: BookOpen,
  "Profit & Loss": TrendingUp,
  "Balance Sheet": Scale,
  "Receivables (AR)": ArrowDownRight,
  "Payables (AP)": ArrowUpRight,
  Batches: Layers,
  Enquiry: Search,
  Audit: ShieldCheck,
};

export default async function ReportsIndex() {
  const user = await requireScreen("reports");
  const shown = REPORTS.filter((r) => canSeeReport(user, r.key));
  const sections = [...new Set(shown.map((r) => r.group))].map((title) => ({
    title,
    icon: ICONS[title] ?? BookOpen,
    items: shown.filter((r) => r.group === title),
  }));
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
                <Link key={item.key} href={item.href} className="group">
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
