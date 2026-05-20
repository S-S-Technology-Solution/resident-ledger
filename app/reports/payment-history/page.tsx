import Link from "next/link";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Receipt as ReceiptIcon } from "lucide-react";
import { ResidentPicker } from "./resident-picker";

export const dynamic = "force-dynamic";

export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; from?: string; to?: string }>;
}) {
  const { residentId, from, to } = await searchParams;
  const residents = await db.resident.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { unitAddress: "asc" },
    select: { id: true, unitAddress: true, ownerName: true },
  });

  const resident = residentId
    ? await db.resident.findUnique({ where: { id: residentId } })
    : null;

  const receipts = residentId
    ? await db.receipt.findMany({
        where: {
          residentId,
          ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
        },
        orderBy: { date: "asc" },
        include: { allocations: { include: { charge: true } } },
      })
    : [];

  const totals = receipts.reduce(
    (s, r) => ({
      paid: s.paid.plus(r.voided ? new Decimal(0) : new Decimal(r.amount.toString())),
      voided: s.voided + (r.voided ? 1 : 0),
    }),
    { paid: new Decimal(0), voided: 0 },
  );

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment History — Per Resident"
        description={description}
        actions={
          <>
            <DateRange />
            {residentId && <ExportButtons slug="payment-history" params={{ residentId, from, to }} />}
          </>
        }
      />

      <div className="rounded-xl border bg-card p-3">
        <ResidentPicker residents={residents} selected={residentId} />
      </div>

      {!residentId ? (
        <Empty icon={ReceiptIcon} title="Pick a resident" description="Select a resident above to view their full payment history." />
      ) : (
        <div className="space-y-4">
          {resident && (
            <div className="flex items-center justify-between rounded-lg border bg-card px-5 py-3 text-sm">
              <div>
                <div className="font-medium">{resident.unitAddress}</div>
                <div className="text-muted-foreground">{resident.ownerName}</div>
              </div>
              <div className="tabular text-right">
                <div className="text-xs text-muted-foreground">Net paid in period</div>
                <div className="text-lg font-semibold text-emerald-700">RM {fmtRM(totals.paid)}</div>
              </div>
            </div>
          )}
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Bank Ref</TableHead>
                  <TableHead>Applied To</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono">
                      <Link className="hover:underline" href={`/receipts/${r.id}`}>{r.receiptNo}</Link>
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.method}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.bankRef ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.allocations.length === 0 ? (
                        <span className="italic text-muted-foreground">Unapplied</span>
                      ) : (
                        r.allocations
                          .map((a) => `${a.charge.periodYear}-${String(a.charge.periodMonth).padStart(2, "0")}`)
                          .join(", ")
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">{fmtRM(r.amount)}</TableCell>
                    <TableCell>{r.voided ? <Badge variant="destructive">Voided</Badge> : <Badge>Posted</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {receipts.length === 0 && (
              <Empty icon={ReceiptIcon} title="No receipts in this period" />
            )}
          </DataCard>
        </div>
      )}
    </div>
  );
}
