import Decimal from "decimal.js";
import { profitAndLoss, plPeriodLabel, type PLLine } from "@/lib/reports";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

/** Negative figures in red with a minus, as the Million report shows them. */
function Figure({ value, pct }: { value: Decimal; pct: Decimal | null }) {
  const red = value.lt(0) ? "text-rose-600" : "";
  return (
    <>
      <td className={`px-3 py-1.5 text-right font-mono tabular ${red}`}>{fmtRM(value)}</td>
      <td className={`px-3 py-1.5 text-right font-mono tabular ${red}`}>{pct === null ? "" : `${pct.toFixed(2)}%`}</td>
    </>
  );
}

function Section({ title, lines, total, pct }: { title: string; lines: PLLine[]; total: Decimal; pct: Decimal | null }) {
  return (
    <>
      <tr><td colSpan={3} className="px-3 pt-5 pb-1 font-semibold">{title}</td></tr>
      {lines.map((l) => (
        <tr key={l.id}>
          <td className="py-1.5 pl-8 pr-3">{l.name}</td>
          <Figure value={l.amount} pct={l.pct} />
        </tr>
      ))}
      {lines.length === 0 && <tr><td colSpan={3} className="py-1.5 pl-8 text-muted-foreground">None</td></tr>}
      <tr className="bg-muted/60 font-medium">
        <td className="px-3 py-1.5" />
        <Figure value={total} pct={pct} />
      </tr>
    </>
  );
}

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireScreen("reports");
  const sp = await searchParams;
  const association = await getAssociation();
  const to = sp.to || new Date().toISOString().slice(0, 10);
  // "As at" a date: year to date, from the start of the financial year.
  const fyStart = `${to.slice(0, 4)}-${String(association.fiscalYearStart).padStart(2, "0")}-01`;
  const from = sp.from || (fyStart <= to ? fyStart : `${Number(to.slice(0, 4)) - 1}${fyStart.slice(4)}`);
  const pl = await profitAndLoss({ from: new Date(from), to: new Date(to) });
  const period = plPeriodLabel(from, to, association.fiscalYearStart);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss Account"
        description="Revenue less expenditure, each line also as a percentage of revenue"
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="profit-loss" params={{ from, to }} />
          </>
        }
      />
      <DataCard>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-base font-semibold">Profit &amp; Loss Account</th>
              <th colSpan={2} className="w-72 bg-muted/60 px-3 py-2 text-center font-normal">
                <div className="font-semibold">{period.heading}</div>
                <div>{period.dates}</div>
                <div className="font-semibold text-primary">RM</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <Section title="Revenue" lines={pl.revenue} total={pl.totalRevenue} pct={pl.pct(pl.totalRevenue)} />
            <Section title="Less : Expenditure" lines={pl.expenditure} total={pl.totalExpenditure} pct={pl.pct(pl.totalExpenditure)} />
            <tr className="border-t-2 font-semibold">
              <td className="px-3 pt-5 pb-2">Net Surplus/(Deficit)</td>
              <Figure value={pl.net} pct={pl.pct(pl.net)} />
            </tr>
          </tbody>
        </table>
      </DataCard>
    </div>
  );
}
