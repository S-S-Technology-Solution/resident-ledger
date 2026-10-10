import Link from "next/link";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { trialBalanceRows } from "@/lib/reports";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Button } from "@/components/ui/button";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

/** "74,265.77 Dr" — a balance with its side, as accountants read it. */
function side(v: Decimal) {
  if (v.eq(0)) return "—";
  return `${fmtRM(v.abs())} ${v.gt(0) ? "Dr" : "Cr"}`;
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string }>;
}) {
  await requireScreen("reports");
  const sp = await searchParams;
  const view = sp.view === "movement" ? "movement" : "asAt";
  const to = sp.to || new Date().toISOString().slice(0, 10);
  // Movement view defaults to the month of the "to" date.
  const from = view === "movement" ? (sp.from || `${to.slice(0, 8)}01`) : undefined;
  const rows = await trialBalanceRows({ from: from ? new Date(from) : undefined, to: new Date(to) });

  const dr = (v: Decimal) => (v.gt(0) ? v : new Decimal(0));
  const cr = (v: Decimal) => (v.lt(0) ? v.neg() : new Decimal(0));
  const totals = rows.reduce(
    (t, r) => ({
      closingDr: t.closingDr.plus(dr(r.closing)), closingCr: t.closingCr.plus(cr(r.closing)),
      debit: t.debit.plus(r.debit), credit: t.credit.plus(r.credit),
      openingDr: t.openingDr.plus(dr(r.opening)), openingCr: t.openingCr.plus(cr(r.opening)),
    }),
    { closingDr: new Decimal(0), closingCr: new Decimal(0), debit: new Decimal(0), credit: new Decimal(0), openingDr: new Decimal(0), openingCr: new Decimal(0) },
  );
  const balanced = totals.closingDr.eq(totals.closingCr);

  const description = view === "asAt"
    ? `Year-to-date balances as at ${format(new Date(to), "dd MMM yyyy")}, including opening balances`
    : `Balance brought forward, movements ${format(new Date(from!), "dd MMM yyyy")} to ${format(new Date(to), "dd MMM yyyy")}, and closing balance`;
  const tab = (v: "asAt" | "movement", label: string) => (
    <Button asChild size="sm" variant={view === v ? "default" : "outline"}>
      <Link href={`/reports/trial-balance?view=${v}&to=${to}`}>{label}</Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description={description}
        actions={
          <>
            <DateRange mode={view === "asAt" ? "asOf" : "range"} />
            <ExportButtons slug="trial-balance" params={{ view, from, to }} />
          </>
        }
      />
      <div className="flex gap-2 no-print">{tab("asAt", "As at date")}{tab("movement", "Movement for a period")}</div>

      <DataCard>
        {view === "asAt" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">A/C No.</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.filter((r) => !r.closing.eq(0)).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.closing.gt(0) ? fmtRM(r.closing) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.closing.lt(0) ? fmtRM(r.closing.neg()) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.closingDr)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.closingCr)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">A/C No.</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Balance b/f</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Closing balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell className="whitespace-normal">{r.name}</TableCell>
                  <TableCell className="text-right font-mono tabular">{side(r.opening)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{side(r.closing)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{fmtRM(totals.openingDr)} Dr<br />{fmtRM(totals.openingCr)} Cr</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.debit)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totals.credit)}</TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{fmtRM(totals.closingDr)} Dr<br />{fmtRM(totals.closingCr)} Cr</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </DataCard>
      {!balanced && (
        <p className="text-rose-600 text-sm">Out of balance by {fmtRM(totals.closingDr.minus(totals.closingCr).abs())}</p>
      )}
    </div>
  );
}
