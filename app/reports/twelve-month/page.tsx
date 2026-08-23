import Link from "next/link";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { twelveMonthSummary } from "@/lib/subsidiary-ledger";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ROWS: { key: "sales" | "purchases" | "receipt" | "payment" | "expenses" | "cashBalance"; label: string; emphasis?: boolean }[] = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "receipt", label: "Receipts" },
  { key: "payment", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "cashBalance", label: "Cash & bank balance", emphasis: true },
];

export default async function TwelveMonthPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: rawYear } = await searchParams;
  const year = rawYear ? Number(rawYear) : new Date().getFullYear();

  const [summary, earliest] = await Promise.all([
    twelveMonthSummary(year),
    db.journalEntry.findFirst({
      where: { associationId: DEFAULT_ASSOCIATION_ID, status: "POSTED" },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  const firstYear = earliest?.date.getFullYear() ?? year;
  const years: number[] = [];
  for (let y = new Date().getFullYear(); y >= firstYear; y--) years.push(y);

  return (
    <div className="space-y-6">
      <PageHeader
        title="12-Month Transaction Summary"
        description={`Month by month through ${year}`}
      />

      {years.length > 1 && (
        <div className="flex flex-wrap gap-2 no-print">
          {years.map((y) => (
            <Link
              key={y}
              href={`/reports/twelve-month?year=${y}`}
              className={
                y === year
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48 sticky left-0 bg-card">&nbsp;</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="text-right whitespace-nowrap">{m}</TableHead>
              ))}
              <TableHead className="text-right font-semibold whitespace-nowrap">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => {
              const values = summary[row.key] as Decimal[];
              // A running balance has no meaningful total, only a year-end figure.
              const total = row.key === "cashBalance"
                ? values[11]
                : values.reduce((s, v) => s.plus(v), new Decimal(0));
              return (
                <TableRow key={row.key} className={row.emphasis ? "bg-muted/40" : ""}>
                  <TableCell className={`sticky left-0 bg-inherit ${row.emphasis ? "font-semibold" : "font-medium"}`}>
                    {row.label}
                  </TableCell>
                  {values.map((v, i) => (
                    <TableCell key={i} className="text-right font-mono tabular whitespace-nowrap">
                      {v.isZero() ? "" : fmtRM(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono tabular font-semibold whitespace-nowrap">
                    {fmtRM(total)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Cash &amp; bank balance is the cumulative position at each month end, so its final column is the
        year-end balance rather than a sum.
      </p>
    </div>
  );
}
