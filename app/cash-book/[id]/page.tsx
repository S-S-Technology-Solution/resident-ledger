import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { amountInWords } from "@/lib/receipts";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/app/receipts/[id]/print-button";
import { VoidCashEntryButton } from "./void-button";

export const dynamic = "force-dynamic";

export default async function CashEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await db.cashEntry.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!entry) notFound();

  const association = await getAssociation();
  const amt = Number(entry.amount);
  const isIn = entry.direction === "IN";
  const title = isIn ? "Receipt" : "Payment Voucher";

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          html, body { font-size: 11px; }
          .print-doc { max-width: none !important; border-radius: 0 !important; box-shadow: none !important; }
          .print-doc > header { padding: 12px 16px !important; }
          .print-doc section, .print-doc > div { padding: 10px 16px !important; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">{title} {entry.refNo}</h1>
          {entry.voided && (
            <p className="mt-1"><Badge variant="destructive">VOIDED — {entry.voidReason}</Badge></p>
          )}
        </div>
        <div className="flex gap-2">
          <PrintButton />
          {!entry.voided && <VoidCashEntryButton id={entry.id} refNo={entry.refNo} />}
        </div>
      </div>

      <article className="print-doc relative mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
        <header className="bg-gradient-to-r from-slate-700 to-slate-800 px-8 py-6 text-slate-50 print:bg-white print:bg-none print:text-slate-800">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-white/15 text-sm font-black tracking-tight ring-1 ring-white/30 print:bg-slate-100 print:text-slate-800 print:ring-slate-300">
              {association.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("") || "R"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold leading-tight">{association.name}</div>
              {association.registrationNo && (
                <div className="mt-0.5 text-xs text-slate-200/90 print:text-slate-600">
                  Reg. No: {association.registrationNo}
                </div>
              )}
              {association.address && (
                <div className="mt-0.5 whitespace-pre-line text-xs text-slate-200/90 print:text-slate-600">
                  {association.address}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs uppercase tracking-widest text-slate-200/80 print:text-slate-600">{title}</div>
              <div className="mt-1 font-mono text-xl font-bold print:text-slate-800">{entry.refNo}</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 border-b bg-muted/30 px-8 py-4 text-sm sm:grid-cols-4">
          <Field label="Date" value={format(entry.date, "dd MMM yyyy")} />
          <Field label="Method" value={entry.method === "BANK" ? "Bank Transfer" : "Cash"} />
          <Field label="Bank ref" value={entry.bankRef || "—"} mono />
          <Field label="Cheque no." value={entry.chequeNo || "—"} mono />
        </div>

        <div className="grid grid-cols-1 gap-6 px-8 py-6 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {isIn ? "Received from" : "Paid to"}
            </div>
            <div className="mt-1 text-base font-semibold">{entry.counterparty || "—"}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
            <div className="mt-1 font-mono text-4xl font-bold tabular">RM {fmtRM(amt)}</div>
            <div className="mt-1 text-sm font-medium text-foreground/80">{amountInWords(amt)}</div>
          </div>
        </div>

        <div className="border-t px-8 py-5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {isIn ? "Being receipt for" : "Being payment for"}
          </div>
          <p className="text-sm">{entry.description}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Posted to <span className="font-mono">{entry.account.code}</span> — {entry.account.name}
          </p>
        </div>

        <footer className="flex justify-between px-8 pb-8 pt-12 text-xs text-muted-foreground">
          <div>
            <div className="h-10 w-44 border-b border-dashed" />
            <div className="mt-1 font-medium text-foreground/80">
              {isIn ? "Received by" : "Approved by"}
            </div>
          </div>
          <div className="text-right">
            <div className="italic text-foreground/70">Computer Generated</div>
            <div className="mt-1 font-medium text-foreground/80">Treasurer</div>
            <div className="mt-0.5 text-[10px]">{association.name}</div>
          </div>
        </footer>

        {entry.voided && <div className="void-watermark" />}
      </article>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
