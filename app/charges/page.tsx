import Link from "next/link";
import { format } from "date-fns";
import { CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkGenerateButton } from "./bulk-generate-button";
import { VoidChargeButton } from "./void-charge-button";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const { q, from, to } = await searchParams;
  const charges = await db.charge.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
      ...(q ? {
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { resident: { unitAddress: { contains: q, mode: "insensitive" } } },
          { resident: { ownerName: { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { resident: true },
  });

  const filterActive = !!(q || from || to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Charges"
        description={`${charges.length} ${filterActive ? "matches" : "most recent"}`}
        actions={
          <>
            <BulkGenerateButton />
            <Button asChild><Link href="/charges/new">New Charge</Link></Button>
          </>
        }
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[220px]">
          <label htmlFor="q" className="text-xs text-muted-foreground">Search</label>
          <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Description, unit, owner…" />
        </div>
        <div className="space-y-1">
          <label htmlFor="from" className="text-xs text-muted-foreground">From</label>
          <Input id="from" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-xs text-muted-foreground">To</label>
          <Input id="to" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
        {filterActive && <Button type="button" variant="ghost" asChild><Link href="/charges">Clear</Link></Button>}
      </form>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{format(c.date, "dd MMM yyyy")}</TableCell>
                <TableCell><Link className="font-medium hover:underline" href={`/residents/${c.residentId}`}>{c.resident.unitAddress}</Link></TableCell>
                <TableCell className="text-muted-foreground">{c.description}</TableCell>
                <TableCell className="font-mono text-xs">{c.periodYear}-{String(c.periodMonth).padStart(2, "0")}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(c.amount)}</TableCell>
                <TableCell>{c.voided ? <Badge variant="destructive">Voided</Badge> : <Badge>Posted</Badge>}</TableCell>
                <TableCell className="text-right">
                  {!c.voided && <VoidChargeButton id={c.id} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {charges.length === 0 && (
          <Empty
            icon={CreditCard}
            title={filterActive ? "No charges match" : "No charges yet"}
            description={filterActive ? "Try a different search or clear the filters." : "Create charges manually or bulk-generate the monthly fee for all residents."}
            action={!filterActive && <Button asChild><Link href="/charges/new">New Charge</Link></Button>}
          />
        )}
      </DataCard>
    </div>
  );
}
