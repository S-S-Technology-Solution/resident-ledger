import Link from "next/link";
import { format } from "date-fns";
import { cashBook } from "@/lib/report-queries";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  await requireScreen("reports");
  const { from, to, account } = await searchParams;
  const { accountKey, accountLabel, fromDate, toDate, opening, rows, totalIn, totalOut, closing } =
    await cashBook({ from, to, account });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description={`${accountLabel} · ${format(fromDate, "dd MMM yyyy")} — ${format(toDate, "dd MMM yyyy")}`}
        actions={
          <div className="flex items-end gap-3 no-print">
            <div className="flex rounded-md border bg-card p-0.5 text-sm">
              <Link
                href={{ pathname: "/reports/cash-book", query: { account: "BANK", from, to } }}
                className={`px-3 py-1 rounded ${accountKey === "BANK" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                Bank
              </Link>
              <Link
                href={{ pathname: "/reports/cash-book", query: { account: "CASH", from, to } }}
                className={`px-3 py-1 rounded ${accountKey === "CASH" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                Cash
              </Link>
            </div>
            <DateRange mode="range" />
            <ExportButtons slug="cash-book" params={{ account: accountKey, from, to }} />
          </div>
        }
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Voucher #</TableHead>
              <TableHead>Payee / From</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Receipt (In)</TableHead>
              <TableHead className="text-right">Payment (Out)</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{format(fromDate, "dd MMM yyyy")}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="font-medium">Balance brought forward</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(opening)}</TableCell>
            </TableRow>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm italic text-muted-foreground">
                  No movements on this account in the selected period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{r.voucher}</TableCell>
                  <TableCell>{r.payee}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.balance)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">Period totals</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalIn)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalOut)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(closing)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
