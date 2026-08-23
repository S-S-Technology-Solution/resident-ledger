import Link from "next/link";
import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

/**
 * What was invoiced to each resident over a period, and how much of it has been
 * settled. Brought-forward balances are left out — they are not sales of the period.
 */
export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const charges = await db.charge.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      voided: false,
      isOpeningBalance: false,
      ...(fromDate || toDate
        ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
        : {}),
    },
    include: {
      resident: { select: { id: true, debtorCode: true, unitAddress: true, ownerName: true } },
      allocations: { include: { receipt: { select: { voided: true } } } },
    },
  });

  const byResident = new Map<string, {
    id: string; code: string | null; unit: string; owner: string;
    count: number; billed: Decimal; settled: Decimal;
  }>();

  for (const c of charges) {
    const r = c.resident;
    const entry = byResident.get(r.id) ?? {
      id: r.id, code: r.debtorCode, unit: r.unitAddress, owner: r.ownerName,
      count: 0, billed: new Decimal(0), settled: new Decimal(0),
    };
    entry.count++;
    entry.billed = entry.billed.plus(new Decimal(c.amount.toString()));
    entry.settled = entry.settled.plus(
      c.allocations
        .filter((a) => !a.receipt.voided)
        .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0)),
    );
    byResident.set(r.id, entry);
  }

  const rows = [...byResident.values()].sort((a, b) => b.billed.comparedTo(a.billed));
  const totalBilled = rows.reduce((s, r) => s.plus(r.billed), new Decimal(0));
  const totalSettled = rows.reduce((s, r) => s.plus(r.settled), new Decimal(0));

  const description = fromDate || toDate
    ? `${fromDate ? format(fromDate, "dd MMM yyyy") : "Beginning"} to ${toDate ? format(toDate, "dd MMM yyyy") : "today"}`
    : "All dates";

  return (
    <div className="space-y-6">
      <PageHeader title="Debtors Sales Report" description={description} actions={<DateRange />} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Invoices raised" value={String(charges.length)} />
        <Stat label="Total billed" value={fmtRM(totalBilled)} />
        <Stat label="Settled" value={fmtRM(totalSettled)} />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Debtor A/C</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-24 text-right">Invoices</TableHead>
              <TableHead className="w-32 text-right">Billed</TableHead>
              <TableHead className="w-32 text-right">Settled</TableHead>
              <TableHead className="w-32 text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-muted-foreground">{r.code ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/residents/${r.id}`} className="hover:underline">{r.unit}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.owner}</TableCell>
                <TableCell className="text-right tabular">{r.count}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.billed)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.settled)}</TableCell>
                <TableCell className="text-right font-mono tabular font-medium">
                  {fmtRM(r.billed.minus(r.settled))}
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalBilled)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalSettled)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">
                  {fmtRM(totalBilled.minus(totalSettled))}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty title="Nothing invoiced" description="No invoices were raised in this period." />
        )}
      </DataCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular">{value}</div>
    </div>
  );
}
