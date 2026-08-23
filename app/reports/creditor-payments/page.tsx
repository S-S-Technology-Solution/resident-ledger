import Link from "next/link";
import Decimal from "decimal.js";
import { format } from "date-fns";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";

export const dynamic = "force-dynamic";

/** Every payment made to suppliers in a period — Million's "List Creditors Payment". */
export default async function CreditorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const payments = await db.billPayment.findMany({
    where: {
      bill: { associationId: DEFAULT_ASSOCIATION_ID, status: { not: "VOIDED" } },
      ...(fromDate || toDate
        ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
        : {}),
    },
    include: { bill: { include: { supplier: true } } },
    orderBy: [{ date: "desc" }],
  });

  const total = payments.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
  const byMethod = payments.reduce((m, p) => {
    m.set(p.method, (m.get(p.method) ?? new Decimal(0)).plus(new Decimal(p.amount.toString())));
    return m;
  }, new Map<string, Decimal>());

  const description = fromDate || toDate
    ? `${fromDate ? format(fromDate, "dd MMM yyyy") : "Beginning"} to ${toDate ? format(toDate, "dd MMM yyyy") : "today"}`
    : "All dates";

  return (
    <div className="space-y-6">
      <PageHeader title="Creditor Payments" description={description} actions={<><DateRange /><ExportButtons slug="creditor-payments" params={{ from, to }} /></>} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Payments" value={String(payments.length)} />
        <Stat label="Total paid" value={fmtRM(total)} />
        <Stat
          label="By method"
          value={[...byMethod.entries()].map(([m, v]) => `${m} ${fmtRM(v)}`).join(" · ") || "—"}
          small
        />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="w-28">Creditor A/C</TableHead>
              <TableHead className="w-36">Invoice</TableHead>
              <TableHead className="w-24">Method</TableHead>
              <TableHead className="w-40">Reference</TableHead>
              <TableHead className="w-24">Cleared</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{format(p.date, "dd MMM yyyy")}</TableCell>
                <TableCell>{p.bill.supplier.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {p.bill.supplier.creditorCode ?? "—"}
                </TableCell>
                <TableCell className="font-mono">
                  <Link href={`/bills/${p.billId}`} className="hover:underline">
                    {p.bill.invoiceNo}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.method}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{p.bankRef ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.cleared ? "Yes" : "—"}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(p.amount)}</TableCell>
              </TableRow>
            ))}
            {payments.length > 0 && (
              <TableRow>
                <TableCell colSpan={7} className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(total)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {payments.length === 0 && (
          <Empty
            icon={Truck}
            title="No payments"
            description="No supplier payments were made in this period."
          />
        )}
      </DataCard>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono font-semibold tabular ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </div>
    </div>
  );
}
