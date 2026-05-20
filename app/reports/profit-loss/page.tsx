import { accountBalances } from "@/lib/reports";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { format } from "date-fns";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
  const all = await accountBalances(range);
  const income = all.filter((a) => a.type === "INCOME" && !a.balance.eq(0));
  const expense = all.filter((a) => a.type === "EXPENSE" && !a.balance.eq(0));
  const totalIncome = income.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalExpense = expense.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const net = totalIncome.minus(totalExpense);

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="profit-loss" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow><TableCell colSpan={2} className="font-semibold bg-muted/50">Income</TableCell></TableRow>
            {income.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-8">{a.code} — {a.name}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(a.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total Income</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalIncome)}</TableCell>
            </TableRow>

            <TableRow><TableCell colSpan={2} className="font-semibold bg-muted/50">Expense</TableCell></TableRow>
            {expense.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-8">{a.code} — {a.name}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(a.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total Expense</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalExpense)}</TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="font-semibold">Net Income</TableCell>
              <TableCell className={`text-right font-mono tabular font-semibold ${net.gte(0) ? "" : "text-rose-600"}`}>
                {fmtRM(net)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}
