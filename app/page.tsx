import Link from "next/link";
import { format } from "date-fns";
import { Wallet, Landmark, ArrowDownRight, ArrowUpRight, AlertTriangle, Receipt as ReceiptIcon, Inbox, Plus, FileText, CircleDollarSign } from "lucide-react";
import { dashboardStats } from "@/lib/dashboard";
import { fmtRM } from "@/lib/money";
import { StatCard } from "@/components/stat-card";
import { Empty } from "@/components/empty";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await dashboardStats();
  const monthLabel = format(new Date(), "MMMM yyyy");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={"Snapshot for " + monthLabel}
        actions={
          <>
            <Button asChild>
              <Link href="/receipts/new"><Plus className="h-4 w-4" />New Receipt</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/bills/new"><FileText className="h-4 w-4" />New Bill</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/charges/new"><CircleDollarSign className="h-4 w-4" />New Charge</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cash & Bank"
          value={`RM ${fmtRM(s.cashOnHand)}`}
          hint={`Bank ${fmtRM(s.bankBalance)} · Cash ${fmtRM(s.cashInHand)}`}
          icon={Landmark}
        />
        <StatCard
          label="Receivables (AR)"
          value={`RM ${fmtRM(s.arOutstanding)}`}
          hint="Outstanding from residents"
          tone={s.arOutstanding.gt(0) ? "warn" : "default"}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Payables (AP)"
          value={`RM ${fmtRM(s.apOutstanding)}`}
          hint="Owed to suppliers"
          tone={s.apOutstanding.gt(0) ? "warn" : "default"}
          icon={ArrowUpRight}
        />
        <StatCard
          label={`Net — ${monthLabel}`}
          value={`RM ${fmtRM(s.netMonth)}`}
          hint={`Income ${fmtRM(s.incomeMonth)} · Expense ${fmtRM(s.expenseMonth)}`}
          tone={s.netMonth.gte(0) ? "good" : "bad"}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-semibold">Top debtors</h2>
            </div>
            <Link href="/reports/ar-ageing" className="text-xs text-muted-foreground hover:text-foreground">Ageing →</Link>
          </div>
          {s.topDebtors.length === 0 ? (
            <Empty icon={Inbox} title="No outstanding debtors" description="Every resident is up to date." />
          ) : (
            <ul className="divide-y">
              {s.topDebtors.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/residents/${d.id}`} className="font-medium hover:underline truncate block">{d.unitAddress}</Link>
                    <div className="text-xs text-muted-foreground truncate">{d.ownerName}</div>
                  </div>
                  <div className="tabular font-semibold text-rose-600">RM {fmtRM(d.balance)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-1 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2">
              <ReceiptIcon className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-semibold">Recent receipts</h2>
            </div>
            <Link href="/receipts" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>
          </div>
          {s.recentReceipts.length === 0 ? (
            <Empty
              icon={ReceiptIcon}
              title="No receipts yet"
              action={<Button asChild size="sm"><Link href="/receipts/new">Take payment</Link></Button>}
            />
          ) : (
            <ul className="divide-y">
              {s.recentReceipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/receipts/${r.id}`} className="font-medium hover:underline truncate block">
                      {r.receiptNo}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.resident.unitAddress} · {format(r.date, "dd MMM")}
                    </div>
                  </div>
                  <div className="tabular font-semibold text-emerald-700">RM {fmtRM(r.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-1 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-semibold">Unpaid bills</h2>
            </div>
            <Link href="/bills?status=UNPAID" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>
          </div>
          {s.recentBills.length === 0 ? (
            <Empty icon={Inbox} title="Nothing outstanding" description="All bills are paid." />
          ) : (
            <ul className="divide-y">
              {s.recentBills.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/bills/${b.id}`} className="font-medium hover:underline truncate block">{b.supplier.name}</Link>
                    <div className="text-xs text-muted-foreground truncate">{b.invoiceNo} · {format(b.date, "dd MMM")}</div>
                  </div>
                  <div className="tabular font-semibold text-rose-600">RM {fmtRM(b.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
