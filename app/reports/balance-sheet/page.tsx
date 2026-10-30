import { financialPosition } from "@/lib/financial-statements";
import { fmtRM } from "@/lib/money";
import { DateRange } from "../_components/date-range";
import { FinancialStatementView } from "../_components/financial-statement";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function BSPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  await requireScreen("reports");
  const sp = await searchParams;
  const to = sp.to || new Date().toISOString().slice(0, 10);
  const fs = await financialPosition(to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balance Sheet"
        description="Statement of financial position"
        actions={
          <>
            <DateRange mode="asOf" />
            <ExportButtons slug="balance-sheet" params={{ to }} />
          </>
        }
      />
      <DataCard>
        <FinancialStatementView fs={fs} />
      </DataCard>
      {fs.difference && !fs.difference.eq(0) && (
        <p className="text-rose-600 text-sm">Out of balance by {fmtRM(fs.difference.abs())}</p>
      )}
    </div>
  );
}
