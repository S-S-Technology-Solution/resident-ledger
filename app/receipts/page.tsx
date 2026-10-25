import Link from "next/link";
import { format } from "date-fns";
import { Receipt as ReceiptIcon } from "lucide-react";
import { db } from "@/lib/db";
import { fmtRM } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Pager, PAGE_SIZE, pageFrom } from "@/components/pager";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";
import { receiptWhere, RECEIPT_ORDER } from "@/lib/list-filters";
import { ExportButtons } from "@/components/export-buttons";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireScreen("receipts");
  const sp = await searchParams;
  const { q, from, to } = sp;
  const page = pageFrom(sp.page);
  const where = receiptWhere({ q, from, to });
  const [receipts, total] = await Promise.all([
    db.receipt.findMany({
      where,
      orderBy: RECEIPT_ORDER,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { resident: true },
    }),
    db.receipt.count({ where }),
  ]);

  const filterActive = !!(q || from || to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description={`${total.toLocaleString()} ${filterActive ? (total === 1 ? "match" : "matches") : "receipts, newest first"}`}
        actions={
          <>
            <ExportButtons slug="receipts" params={{ q, from, to }} />
            <Writable><Button asChild><Link href="/receipts/new">New Receipt</Link></Button></Writable>
          </>
        }
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input name="q" defaultValue={q ?? ""} placeholder="Receipt #, unit, owner, bank ref…" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
        {filterActive && <Button type="button" variant="ghost" asChild><Link href="/receipts">Clear</Link></Button>}
      </form>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt #</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                <TableCell className="font-mono">{r.receiptNo}</TableCell>
                <TableCell className="font-medium">{r.resident.unitAddress}</TableCell>
                <TableCell className="text-muted-foreground">{r.resident.ownerName}</TableCell>
                <TableCell><Badge variant="outline">{r.method}</Badge></TableCell>
                <TableCell className="text-right font-mono tabular text-emerald-700 font-semibold">{fmtRM(r.amount)}</TableCell>
                <TableCell>{r.voided ? <Badge variant="destructive">Voided</Badge> : <Badge>Posted</Badge>}</TableCell>
                <TableCell><Link href={`/receipts/${r.id}`} className="text-sm underline">Open</Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {receipts.length === 0 && (
          <Empty
            icon={ReceiptIcon}
            title={filterActive ? "No receipts match" : "No receipts yet"}
            description={filterActive ? "Try a different search or clear the filters." : "Take a payment to issue the first official receipt."}
            action={!filterActive && <Writable><Button asChild><Link href="/receipts/new">Take payment</Link></Button></Writable>}
          />
        )}
        <Pager path="/receipts" params={sp} page={page} total={total} />
      </DataCard>
    </div>
  );
}
