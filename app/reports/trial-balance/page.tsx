import { accountBalances } from "@/lib/reports";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { format } from "date-fns";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
  const rows = await accountBalances(range);
  const totalDebit = rows.reduce((s, r) => s.plus(r.debit), new Decimal(0));
  const totalCredit = rows.reduce((s, r) => s.plus(r.credit), new Decimal(0));

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="trial-balance" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.filter((r) => !r.debit.eq(0) || !r.credit.eq(0)).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalDebit)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalCredit)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
      {!totalDebit.equals(totalCredit) && (
        <p className="text-rose-600 text-sm">Out of balance by {fmtRM(totalDebit.minus(totalCredit).abs())}</p>
      )}
    </div>
  );
}
