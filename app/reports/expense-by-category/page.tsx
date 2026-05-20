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

export default async function ExpenseByCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;

  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, type: "EXPENSE" },
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: {
          entry: {
            status: "POSTED",
            ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
          },
        },
        select: { debit: true, credit: true },
      },
    },
  });

  const rows = accounts.map((a) => {
    const d = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
    const c = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
    return { code: a.code, name: a.name, amount: d.minus(c) };
  }).filter((r) => !r.amount.eq(0));

  const total = rows.reduce((s, r) => s.plus(r.amount), new Decimal(0));

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense by Category"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="expense-by-category" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead className="w-24">Code</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.amount)}</TableCell>
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
