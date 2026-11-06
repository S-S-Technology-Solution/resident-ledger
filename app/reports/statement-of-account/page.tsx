import Link from "next/link";
import { format } from "date-fns";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { statementAsAt } from "@/lib/resident-statement";
import { fmtRM } from "@/lib/money";
import { entryHref } from "@/lib/drill";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { DrillLink } from "@/components/drill-link";
import { ExportButtons } from "@/components/export-buttons";
import { DateRange } from "../_components/date-range";
import { requireReport } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function StatementOfAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; to?: string }>;
}) {
  await requireReport("statement-of-account");
  const { id, to } = await searchParams;

  const [residents, s] = await Promise.all([
    db.resident.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: { debtorCode: "asc" },
      select: { id: true, debtorCode: true, unitAddress: true },
    }),
    id ? statementAsAt(id, to) : null,
  ]);
  const cur = s?.association.currency;

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .print-soa { max-width: none !important; min-height: 275mm; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print space-y-6">
        <PageHeader
          title="Statement of Account"
          description={s ? `${s.resident.code ?? ""} ${s.resident.unit} — ${s.resident.name}`.trim() : "One resident's account as at a date"}
          actions={
            <>
              <DateRange mode="asOf" />
              {s && <ExportButtons slug="statement-of-account" params={{ id, to }} />}
            </>
          }
        />
        <div className="rounded-xl border bg-card p-3">
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {residents.map((r) => (
              <Link
                key={r.id}
                href={`/reports/statement-of-account?${new URLSearchParams({ id: r.id, ...(to && { to }) })}`}
                className={
                  id === r.id
                    ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                    : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                }
              >
                {r.debtorCode ?? r.unitAddress}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!s ? (
        <DataCard>
          <Empty icon={Users} title="Pick a resident" description="Choose an account above to see the statement." />
        </DataCard>
      ) : (
        <article className="print-soa mx-auto flex min-h-[56rem] max-w-4xl flex-col rounded-lg border bg-card p-8 text-sm shadow-sm">
          <header className="text-center">
            <div className="text-lg font-bold">{s.association.name}</div>
            {s.association.registrationNo && <div className="text-xs">{s.association.registrationNo}</div>}
            {s.association.address && <div className="whitespace-pre-line text-xs">{s.association.address}</div>}
          </header>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">{s.resident.name}</div>
              <div className="text-xs">{s.resident.unit}</div>
            </div>
            <div className="text-lg font-bold">STATEMENT OF ACCOUNT</div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-4 text-xs">
            <div className="font-mono">{s.resident.code}</div>
            <div className="flex gap-10 text-right">
              <div><div className="font-semibold">MONTH</div><div className="mt-1">{s.month}</div></div>
              <div><div className="font-semibold">DATE</div><div className="mt-1">{s.date}</div></div>
            </div>
          </div>

          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-y border-foreground/60 text-left">
                <th className="py-1.5 font-semibold">DATE</th>
                <th className="py-1.5 font-semibold">REF NO.</th>
                <th className="py-1.5 font-semibold">DESCRIPTION</th>
                <th className="py-1.5 text-right font-semibold">DEBIT<br />{cur}</th>
                <th className="py-1.5 text-right font-semibold">CREDIT<br />{cur}</th>
                <th className="py-1.5 text-right font-semibold">BALANCE<br />{cur}</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{format(r.date, "dd/MM/yyyy")}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {r.entryId ? <DrillLink href={entryHref(r.entryId)}>{r.refNo}</DrillLink> : r.refNo}
                  </td>
                  <td className="py-1 pr-3">
                    {r.description}
                    {r.detail && <div className="italic">{r.detail}</div>}
                  </td>
                  <td className="py-1 text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</td>
                  <td className="py-1 text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</td>
                  <td className="py-1 text-right font-mono tabular">{fmtRM(r.balance)}</td>
                </tr>
              ))}
              {s.rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center italic text-muted-foreground">Nothing on this account up to this date</td></tr>
              )}
            </tbody>
          </table>

          <footer className="mt-auto break-inside-avoid pt-10 text-xs">
            <div className="font-semibold">RINGGIT M&apos;SIA : {s.words}</div>
            <div className="mt-1 border-t border-foreground/60 py-1 text-right font-mono tabular font-semibold">{fmtRM(s.closing)}</div>
            <div className="grid grid-cols-3 border border-foreground/60 sm:grid-cols-6">
              {s.ageing.map((a) => (
                <div key={a.label} className="border-r border-foreground/60 text-right last:border-r-0">
                  <div className="border-b border-foreground/60 px-2 py-1 font-medium">{a.label}</div>
                  <div className="px-2 py-1 font-mono tabular">{fmtRM(a.amount)}</div>
                </div>
              ))}
            </div>
            <p className="mt-2">We shall be grateful if you will let us have payment as soon as possible.</p>
            <p>Any discrepancy in this statement please inform us in writing within 10 days.</p>
          </footer>
        </article>
      )}
    </div>
  );
}
