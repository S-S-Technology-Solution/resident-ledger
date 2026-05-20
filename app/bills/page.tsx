import Link from "next/link";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["UNPAID", "PARTIAL", "PAID", "VOIDED"] as const;

function qs(p: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }>;
}) {
  const { status, q, from, to } = await searchParams;
  const bills = await db.bill.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      ...(status ? { status: status as "UNPAID" | "PARTIAL" | "PAID" | "VOIDED" } : {}),
      ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
      ...(q ? {
        OR: [
          { invoiceNo: { contains: q, mode: "insensitive" } },
          { supplier: { name: { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { supplier: true },
    take: 200,
  });

  const filterActive = !!(q || from || to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills"
        description={`${bills.length} ${status ? `· ${status.toLowerCase()}` : ""}${filterActive ? " · filtered" : ""}`}
        actions={<Button asChild><Link href="/bills/new">New Bill</Link></Button>}
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input name="q" defaultValue={q ?? ""} placeholder="Invoice # or supplier name…" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <Button type="submit" variant="outline">Apply</Button>
        {(filterActive || status) && (
          <Button type="button" variant="ghost" asChild><Link href="/bills">Clear</Link></Button>
        )}
      </form>

      <nav className="flex items-center gap-1 text-sm border-b">
        <Link href={`/bills${qs({ q, from, to })}`} className={cn("px-3 py-2 -mb-px border-b-2", !status ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>All</Link>
        {STATUSES.map((f) => (
          <Link key={f} href={`/bills${qs({ q, from, to, status: f })}`}
            className={cn("px-3 py-2 -mb-px border-b-2 uppercase text-xs tracking-wide", status === f ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{f}</Link>
        ))}
      </nav>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((b) => {
              const bal = new Decimal(b.amount.toString()).minus(new Decimal(b.paid.toString()));
              return (
                <TableRow key={b.id}>
                  <TableCell>{format(b.date, "yyyy-MM-dd")}</TableCell>
                  <TableCell className="font-mono">{b.invoiceNo}</TableCell>
                  <TableCell className="font-medium">{b.supplier.name}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(b.amount)}</TableCell>
                  <TableCell className="text-right font-mono tabular text-muted-foreground">{fmtRM(b.paid)}</TableCell>
                  <TableCell className={cn("text-right font-mono tabular", bal.gt(0) ? "text-rose-600 font-semibold" : "")}>{fmtRM(bal)}</TableCell>
                  <TableCell>
                    {b.status === "UNPAID" && <Badge variant="outline">Unpaid</Badge>}
                    {b.status === "PARTIAL" && <Badge variant="secondary">Partial</Badge>}
                    {b.status === "PAID" && <Badge>Paid</Badge>}
                    {b.status === "VOIDED" && <Badge variant="destructive">Voided</Badge>}
                  </TableCell>
                  <TableCell><Link href={`/bills/${b.id}`} className="text-sm underline">Open</Link></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {bills.length === 0 && (
          <Empty
            icon={FileText}
            title={status || filterActive ? "No bills match" : "No bills yet"}
            description={status || filterActive ? "Adjust filters or clear them." : "Record bills from suppliers to track AP."}
            action={!status && !filterActive && <Button asChild><Link href="/bills/new">New Bill</Link></Button>}
          />
        )}
      </DataCard>
    </div>
  );
}
