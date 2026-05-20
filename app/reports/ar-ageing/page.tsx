import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { ageingBucket } from "@/lib/ar";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";

export const dynamic = "force-dynamic";

type Row = {
  unit: string;
  owner: string;
  current: Decimal;
  d1_30: Decimal;
  d31_60: Decimal;
  d61_90: Decimal;
  d90p: Decimal;
  total: Decimal;
};

export default async function ARAgeingPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const asOf = to ? new Date(to) : new Date();

  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    include: {
      charges: {
        where: { voided: false, date: { lte: asOf } },
        include: { allocations: { include: { receipt: true } } },
      },
      receipts: {
        where: { voided: false, date: { lte: asOf } },
        include: { allocations: true },
      },
    },
  });

  const rows: Row[] = residents.map((r) => {
    const buckets = {
      current: new Decimal(0),
      d1_30: new Decimal(0),
      d31_60: new Decimal(0),
      d61_90: new Decimal(0),
      d90p: new Decimal(0),
    };
    for (const c of r.charges) {
      const amount = new Decimal(c.amount.toString());
      const allocated = c.allocations
        .filter((a) => !a.receipt.voided && a.receipt.date <= asOf)
        .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const open = amount.minus(allocated);
      if (open.eq(0)) continue;
      const bucket = ageingBucket(c.date, asOf);
      buckets[bucket] = buckets[bucket].plus(open);
    }
    for (const p of r.receipts) {
      const total = new Decimal(p.amount.toString());
      const allocated = p.allocations.reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const unapplied = total.minus(allocated);
      if (unapplied.gt(0)) buckets.current = buckets.current.minus(unapplied);
    }
    const total = buckets.current.plus(buckets.d1_30).plus(buckets.d31_60).plus(buckets.d61_90).plus(buckets.d90p);
    return { unit: r.unitAddress, owner: r.ownerName, ...buckets, total };
  }).filter((r) => !r.total.eq(0));

  const totals = rows.reduce(
    (s, r) => ({
      current: s.current.plus(r.current),
      d1_30: s.d1_30.plus(r.d1_30),
      d31_60: s.d31_60.plus(r.d31_60),
      d61_90: s.d61_90.plus(r.d61_90),
      d90p: s.d90p.plus(r.d90p),
      total: s.total.plus(r.total),
    }),
    {
      current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0),
      d61_90: new Decimal(0), d90p: new Decimal(0), total: new Decimal(0),
    },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="A/R Ageing Summary"
        description={`As of ${format(asOf, "dd MMM yyyy")}`}
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="ar-ageing" params={{ to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">1–30 days</TableHead>
              <TableHead className="text-right">31–60 days</TableHead>
              <TableHead className="text-right">61–90 days</TableHead>
              <TableHead className="text-right">&gt; 90 days</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.unit}>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="text-muted-foreground">{r.owner}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.current)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.d1_30)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.d31_60)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.d61_90)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.d90p)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.current)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.d1_30)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.d31_60)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.d61_90)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.d90p)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
