import { format } from "date-fns";
import { cashFlow } from "@/lib/report-queries";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireScreen("reports");
  const { from, to } = await searchParams;
  const { cashAccounts, fromDate, toDate, opening, inflows, outflows, movement, closing } = await cashFlow({ from, to });

  const description = fromDate
    ? `${format(fromDate, "dd MMM yyyy")} to ${format(toDate, "dd MMM yyyy")}`
    : `Up to ${format(toDate, "dd MMM yyyy")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Statement"
        description={description}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="cash-flow" params={{ from, to }} />
          </>
        }
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Source of movement</TableHead>
              <TableHead className="w-40 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={2} className="font-semibold">Cash at start of period</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(opening)}</TableCell>
            </TableRow>

            <TableRow className="bg-muted/20">
              <TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cash received
              </TableCell>
            </TableRow>
            {inflows.map((r) => (
              <TableRow key={`in-${r.code}`}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {fmtRM(r.inflow.minus(r.outflow))}
                </TableCell>
              </TableRow>
            ))}
            {inflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm italic text-muted-foreground">
                  Nothing received in this period
                </TableCell>
              </TableRow>
            )}

            <TableRow className="bg-muted/20">
              <TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cash paid out
              </TableCell>
            </TableRow>
            {outflows.map((r) => (
              <TableRow key={`out-${r.code}`}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  ({fmtRM(r.outflow.minus(r.inflow))})
                </TableCell>
              </TableRow>
            ))}
            {outflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm italic text-muted-foreground">
                  Nothing paid out in this period
                </TableCell>
              </TableRow>
            )}

            <TableRow>
              <TableCell colSpan={2} className="font-semibold">Net movement in cash</TableCell>
              <TableCell className={`text-right font-mono tabular font-semibold ${movement.isNegative() ? "text-rose-600" : ""}`}>
                {fmtRM(movement)}
              </TableCell>
            </TableRow>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={2} className="font-semibold">Cash at end of period</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(closing)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Built from movements on {cashAccounts.map((a) => `${a.code} ${a.name}`).join(" and ")}, grouped by
        the account on the other side of each entry.
      </p>
    </div>
  );
}
