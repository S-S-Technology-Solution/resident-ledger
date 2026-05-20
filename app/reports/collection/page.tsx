import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";

export const dynamic = "force-dynamic";

export default async function CollectionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const dateRange = (from || to) ? {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  } : undefined;

  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    include: {
      charges: { where: { voided: false, ...(dateRange ? { date: dateRange } : {}) } },
      receipts: { where: { voided: false, ...(dateRange ? { date: dateRange } : {}) } },
    },
  });

  const rows = residents.map((r) => {
    const billed = r.charges.reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0));
    const collected = r.receipts.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    return { unit: r.unitAddress, owner: r.ownerName, billed, collected, net: billed.minus(collected) };
  }).filter((r) => !r.billed.eq(0) || !r.collected.eq(0));

  const totals = rows.reduce(
    (s, r) => ({ billed: s.billed.plus(r.billed), collected: s.collected.plus(r.collected), net: s.net.plus(r.net) }),
    { billed: new Decimal(0), collected: new Decimal(0), net: new Decimal(0) },
  );

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collection Report"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="collection" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.unit}>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="text-muted-foreground">{r.owner}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.billed)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.collected)}</TableCell>
                <TableCell className={`text-right font-mono tabular ${r.net.gt(0) ? "text-rose-600" : ""}`}>{fmtRM(r.net)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.billed)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.collected)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.net)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
