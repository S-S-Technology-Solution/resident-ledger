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

export default async function BSPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const asOf = to ? new Date(to) : new Date();
  const all = await accountBalances({ to: asOf });

  const assets = all.filter((a) => a.type === "ASSET" && !a.balance.eq(0));
  const liabilities = all.filter((a) => a.type === "LIABILITY" && !a.balance.eq(0));
  const equity = all.filter((a) => a.type === "EQUITY" && !a.balance.eq(0));

  const income = all.filter((a) => a.type === "INCOME");
  const expense = all.filter((a) => a.type === "EXPENSE");
  const netIncome = income.reduce((s, a) => s.plus(a.balance), new Decimal(0))
    .minus(expense.reduce((s, a) => s.plus(a.balance), new Decimal(0)));

  const totalAssets = assets.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalLiab = liabilities.reduce((s, a) => s.plus(a.balance), new Decimal(0));
  const totalEquity = equity.reduce((s, a) => s.plus(a.balance), new Decimal(0)).plus(netIncome);

  function group(title: string, rows: typeof all) {
    return (
      <>
        <TableRow><TableCell colSpan={2} className="font-semibold bg-muted/50">{title}</TableCell></TableRow>
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="pl-8">{a.code} — {a.name}</TableCell>
            <TableCell className="text-right font-mono tabular">{fmtRM(a.balance)}</TableCell>
          </TableRow>
        ))}
      </>
    );
  }

  const description = `As of ${format(asOf, "dd MMM yyyy")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balance Sheet"
        description={description}
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="balance-sheet" params={{ to }} />
          </>
        }
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {group("Assets", assets)}
            <TableRow>
              <TableCell className="font-semibold">Total Assets</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalAssets)}</TableCell>
            </TableRow>

            {group("Liabilities", liabilities)}
            <TableRow>
              <TableCell className="font-semibold">Total Liabilities</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalLiab)}</TableCell>
            </TableRow>

            {group("Equity", equity)}
            <TableRow>
              <TableCell className="pl-8">Net Income (period to date)</TableCell>
              <TableCell className="text-right font-mono tabular">{fmtRM(netIncome)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold">Total Equity</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalEquity)}</TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="font-semibold">Total Liabilities &amp; Equity</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalLiab.plus(totalEquity))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataCard>
      {!totalAssets.equals(totalLiab.plus(totalEquity)) && (
        <p className="text-rose-600 text-sm">
          Out of balance by {fmtRM(totalAssets.minus(totalLiab.plus(totalEquity)).abs())}
        </p>
      )}
    </div>
  );
}
