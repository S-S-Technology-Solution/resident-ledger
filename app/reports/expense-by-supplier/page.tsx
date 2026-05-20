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

export default async function ExpenseBySupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const where = {
    associationId: DEFAULT_ASSOCIATION_ID,
    status: { not: "VOIDED" as const },
    ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
  };

  const bills = await db.bill.findMany({
    where,
    include: { supplier: true },
  });

  const byId = new Map<string, { name: string; total: Decimal; count: number }>();
  for (const b of bills) {
    const existing = byId.get(b.supplierId) ?? { name: b.supplier.name, total: new Decimal(0), count: 0 };
    existing.total = existing.total.plus(new Decimal(b.amount.toString()));
    existing.count += 1;
    byId.set(b.supplierId, existing);
  }
  const rows = [...byId.values()].sort((a, b) => b.total.cmp(a.total));
  const total = rows.reduce((s, r) => s.plus(r.total), new Decimal(0));

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense by Supplier"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="expense-by-supplier" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right tabular">{r.count}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
