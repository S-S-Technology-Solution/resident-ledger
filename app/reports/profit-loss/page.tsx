import { incomeStatement } from "@/lib/financial-statements";
import { DateRange } from "../_components/date-range";
import { FinancialStatementView } from "../_components/financial-statement";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireScreen("reports");
  const sp = await searchParams;
  const to = sp.to || new Date().toISOString().slice(0, 10);
  // As at a date: year to date, from the start of the financial year.
  const fs = await incomeStatement(to, sp.from);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss Account"
        description="Statement of income and expenditure, each figure also as a percentage of income"
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="profit-loss" params={{ from: sp.from, to }} />
          </>
        }
      />
      <DataCard>
        <FinancialStatementView fs={fs} />
      </DataCard>
    </div>
  );
}
