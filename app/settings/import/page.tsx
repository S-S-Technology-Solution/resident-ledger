import { getCurrentUser } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await getCurrentUser();
  const readOnly = me?.role !== "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Data"
        description="Load residents, suppliers, opening balances or the chart of accounts from a CSV file"
      />

      {readOnly && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an administrator can import data.
        </p>
      )}

      <ImportForm readOnly={readOnly} />

      <p className="text-xs text-muted-foreground">
        Checking a file never writes anything — it reports exactly what would happen, row by row, so
        you can fix problems before importing. The same code does both, so the preview cannot
        disagree with the result.
      </p>
    </div>
  );
}
