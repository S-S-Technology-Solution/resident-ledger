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
import { Empty } from "@/components/empty";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

function bucketKey(billDate: Date, asOf: Date): "current" | "d1_30" | "d31_60" | "d61_90" | "d90p" {
  const days = Math.floor((asOf.getTime() - billDate.getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90p";
}

export default async function APAgeingPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const asOf = to ? new Date(to) : new Date();

  const bills = await db.bill.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      status: { not: "VOIDED" },
      date: { lte: asOf },
    },
    include: { supplier: true, payments: { where: { date: { lte: asOf } } } },
    orderBy: [{ supplier: { name: "asc" } }, { date: "asc" }],
  });

  type Row = { supplier: string; invoiceNo: string; date: Date; open: Decimal; bucket: ReturnType<typeof bucketKey> };
  const rows: Row[] = bills.flatMap((b) => {
    const paidAsOf = b.payments.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    const open = new Decimal(b.amount.toString()).minus(paidAsOf);
    if (open.lte(0)) return [];
    return [{ supplier: b.supplier.name, invoiceNo: b.invoiceNo, date: b.date, open, bucket: bucketKey(b.date, asOf) }];
  });

  const totals = rows.reduce(
    (s, r) => ({ ...s, [r.bucket]: s[r.bucket].plus(r.open), total: s.total.plus(r.open) }),
    {
      current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0),
      d61_90: new Decimal(0), d90p: new Decimal(0), total: new Decimal(0),
    },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="A/P Ageing"
        description={`As of ${format(asOf, "dd MMM yyyy")}`}
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="ap-ageing" params={{ to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead>Bucket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.supplier}</TableCell>
                <TableCell className="font-mono">{r.invoiceNo}</TableCell>
                <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.open)}</TableCell>
                <TableCell>
                  {r.bucket === "current" && "Current"}
                  {r.bucket === "d1_30" && "1–30 days"}
                  {r.bucket === "d31_60" && "31–60 days"}
                  {r.bucket === "d61_90" && "61–90 days"}
                  {r.bucket === "d90p" && "> 90 days"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>
                <div className="flex flex-wrap justify-end gap-6 font-mono text-sm tabular">
                  <span>Current: <b>{fmtRM(totals.current)}</b></span>
                  <span>1–30: <b>{fmtRM(totals.d1_30)}</b></span>
                  <span>31–60: <b>{fmtRM(totals.d31_60)}</b></span>
                  <span>61–90: <b>{fmtRM(totals.d61_90)}</b></span>
                  <span>&gt;90: <b>{fmtRM(totals.d90p)}</b></span>
                  <span>Total: <b>{fmtRM(totals.total)}</b></span>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        {rows.length === 0 && (
          <Empty icon={FileText} title="No open bills" description="All bills are paid or no bills fall within the period." />
        )}
      </DataCard>
    </div>
  );
}
