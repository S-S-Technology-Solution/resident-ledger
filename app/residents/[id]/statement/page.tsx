import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { amountInWords } from "@/lib/receipts";
import { residentStatement } from "@/lib/resident-statement";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/export-buttons";
import { DateRange } from "@/app/reports/_components/date-range";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireScreen("residents");
  const { id } = await params;
  const { from, to } = await searchParams;

  const [statement, association] = await Promise.all([residentStatement(id, { from, to }), getAssociation()]);
  if (!statement) notFound();
  const { resident, fromDate, toDate, opening, rows: rowsWithRunning, closing, ageing, ageingTotal } = statement;

  const initials = association.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("") || "R";
  const absClose = closing.abs();

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { font-size: 11px; }
          .print-statement { max-width: none !important; border-radius: 0 !important; box-shadow: none !important; border: 0 !important; }
          .print-statement > header { padding: 12px 16px !important; }
          .print-statement > header .h-14 { height: 2.25rem !important; width: 2.25rem !important; font-size: 0.625rem !important; letter-spacing: -0.02em; }
          .print-statement section, .print-statement > div { padding: 8px 16px !important; }
          .print-statement table { font-size: 10px !important; }
        }
      `}</style>

      <div className="flex items-end justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-semibold">Statement of Account</h1>
          <p className="text-sm text-muted-foreground">{resident.unitAddress} · {resident.ownerName}</p>
        </div>
        <div className="flex items-end gap-3">
          <DateRange mode="range" />
          <Button asChild variant="outline"><Link href={`/residents/${id}`}>Back</Link></Button>
          <ExportButtons slug="resident-statement" params={{ residentId: id, from, to }} />
        </div>
      </div>

      <article className="print-statement relative mx-auto max-w-4xl rounded-lg border bg-card shadow-sm overflow-hidden">
        <header className="relative bg-gradient-to-r from-emerald-700 to-emerald-800 px-8 py-6 text-emerald-50 print:bg-white print:bg-none print:text-emerald-800">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-white/15 text-sm font-black tracking-tight ring-1 ring-white/30 print:bg-emerald-100 print:text-emerald-800 print:ring-emerald-300">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold leading-tight">{association.name}</div>
              {association.registrationNo && (
                <div className="text-xs text-emerald-100/90 mt-0.5 print:text-emerald-700">Reg. No: {association.registrationNo}</div>
              )}
              {association.address && (
                <div className="text-xs text-emerald-100/90 mt-0.5 whitespace-pre-line print:text-emerald-700">{association.address}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs uppercase tracking-widest text-emerald-100/80 print:text-emerald-700">Statement of Account</div>
              <div className="mt-1 text-sm font-medium print:text-emerald-800">
                {format(fromDate, "dd MMM yyyy")} — {format(toDate, "dd MMM yyyy")}
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-6 border-b bg-emerald-50/40 px-8 py-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Account Holder</div>
            <div className="mt-0.5 font-semibold">{resident.ownerName}</div>
            <div className="text-sm text-muted-foreground">{resident.unitAddress}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Statement Date</div>
            <div className="mt-0.5 font-medium">{format(toDate, "dd MMM yyyy")}</div>
          </div>
        </div>

        <div className="px-8 py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Ref No.</th>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 font-medium text-right">Debit (RM)</th>
                <th className="py-2 font-medium text-right">Credit (RM)</th>
                <th className="py-2 font-medium text-right">Balance (RM)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">{format(fromDate, "dd MMM yyyy")}</td>
                <td className="py-2 text-muted-foreground"></td>
                <td className="py-2 font-medium">Balance brought forward</td>
                <td className="py-2 text-right font-mono tabular text-muted-foreground"></td>
                <td className="py-2 text-right font-mono tabular text-muted-foreground"></td>
                <td className="py-2 text-right font-mono tabular font-semibold">{fmtRM(opening)}</td>
              </tr>
              {rowsWithRunning.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm italic text-muted-foreground">No transactions in this period</td></tr>
              ) : (
                rowsWithRunning.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{format(r.date, "dd MMM yyyy")}</td>
                    <td className="py-2 font-mono text-xs">{r.refNo}</td>
                    <td className="py-2 text-muted-foreground">{r.description}</td>
                    <td className="py-2 text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</td>
                    <td className="py-2 text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</td>
                    <td className="py-2 text-right font-mono tabular">{fmtRM(r.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-foreground/30">
                <td colSpan={5} className="py-3 text-right font-semibold">Balance as at {format(toDate, "dd MMM yyyy")}</td>
                <td className="py-3 text-right font-mono tabular text-lg font-bold">{fmtRM(closing)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 text-sm font-medium text-foreground/80">
            {amountInWords(Number(absClose))}{closing.lt(0) ? " (CREDIT)" : ""}
          </div>
        </div>

        <div className="border-t px-8 py-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Ageing Summary (as of {format(toDate, "dd MMM yyyy")})</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 text-right font-medium">Current</th>
                <th className="py-2 text-right font-medium">1–30 days</th>
                <th className="py-2 text-right font-medium">31–60 days</th>
                <th className="py-2 text-right font-medium">61–90 days</th>
                <th className="py-2 text-right font-medium">&gt; 90 days</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 text-right font-mono tabular">{fmtRM(ageing.current)}</td>
                <td className="py-2 text-right font-mono tabular">{fmtRM(ageing.d1_30)}</td>
                <td className="py-2 text-right font-mono tabular">{fmtRM(ageing.d31_60)}</td>
                <td className="py-2 text-right font-mono tabular">{fmtRM(ageing.d61_90)}</td>
                <td className="py-2 text-right font-mono tabular">{fmtRM(ageing.d90p)}</td>
                <td className="py-2 text-right font-mono tabular font-semibold">
                  {fmtRM(ageingTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="flex justify-end px-8 pt-12 pb-8 text-xs text-muted-foreground">
          <div className="text-right">
            <div className="italic text-foreground/70">Computer Generated</div>
            <div className="mt-1 font-medium text-foreground/80">Treasurer</div>
            <div className="mt-0.5 text-[10px]">{association.name}</div>
          </div>
        </footer>

        <div className="border-t bg-muted/40 px-8 py-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Computer-generated · If you have already paid, please disregard this statement
        </div>
      </article>
    </div>
  );
}
