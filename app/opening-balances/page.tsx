import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtRM } from "@/lib/money";
import {
  getGLOpeningRows,
  getDebtorOpeningRows,
  getCreditorOpeningRows,
  getOpeningDate,
  openingBalanceCheck,
} from "@/lib/opening-balances";
import { GLOpeningForm } from "./gl-form";
import { SubsidiaryOpeningForm } from "./debtor-form";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "gl", label: "General ledger" },
  { key: "debtors", label: "Debtors" },
  { key: "creditors", label: "Creditors" },
] as const;

export default async function OpeningBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "gl";

  const [glRows, debtors, creditors, openingDate, check] = await Promise.all([
    getGLOpeningRows(),
    getDebtorOpeningRows(),
    getCreditorOpeningRows(),
    getOpeningDate(),
    openingBalanceCheck(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opening Balances"
        description="Balances carried over from the previous system at cut-over"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusCard
          title="General ledger"
          value={check.hasEntry ? fmtRM(check.totalDr) : "Not keyed"}
          ok={check.hasEntry && check.balanced}
          detail={
            !check.hasEntry
              ? "No opening entry yet"
              : check.balanced
                ? "Debits equal credits"
                : `Out by ${fmtRM(Number(check.totalDr) - Number(check.totalCr))}`
          }
        />
        <StatusCard
          title="Debtors vs control"
          value={fmtRM(check.ar.subsidiary)}
          ok={check.ar.agrees}
          detail={check.ar.agrees ? "Agrees with 3000/0000" : `Out by ${fmtRM(check.ar.difference)}`}
        />
        <StatusCard
          title="Creditors vs control"
          value={fmtRM(check.ap.subsidiary)}
          ok={check.ap.agrees}
          detail={check.ap.agrees ? "Agrees with control" : `Out by ${fmtRM(check.ap.difference)}`}
        />
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/opening-balances?tab=${t.key}`}
            className={
              active === t.key
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium"
                : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {active === "gl" && (
        <GLOpeningForm
          initial={glRows}
          openingDate={openingDate.toISOString().slice(0, 10)}
        />
      )}

      {active === "debtors" && (
        <SubsidiaryOpeningForm
          kind="debtor"
          controlAmount={check.ar.control}
          initial={debtors.map((d) => ({
            id: d.residentId,
            code: d.debtorCode,
            primary: d.unitAddress,
            secondary: d.ownerName,
            amount: d.amount,
          }))}
        />
      )}

      {active === "creditors" && (
        <SubsidiaryOpeningForm
          kind="creditor"
          controlAmount={check.ap.control}
          initial={creditors.map((c) => ({
            id: c.supplierId,
            code: c.creditorCode,
            primary: c.name,
            secondary: "",
            amount: c.amount,
          }))}
        />
      )}
    </div>
  );
}

function StatusCard({
  title, value, detail, ok,
}: {
  title: string; value: string; detail: string; ok: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Badge variant={ok ? "default" : "outline"} className={ok ? "" : "text-rose-600 border-rose-300"}>
          {ok ? "OK" : "Check"}
        </Badge>
      </div>
      <div className="mt-2 font-mono text-xl font-semibold tabular">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
