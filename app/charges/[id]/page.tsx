import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { amountInWords } from "@/lib/receipts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/app/receipts/[id]/print-button";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default async function InvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = await db.charge.findUnique({
    where: { id },
    include: { resident: true, allocations: { include: { receipt: true } } },
  });
  if (!charge) notFound();
  const association = await getAssociation();
  const amt = Number(charge.amount);
  const initials = association.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("") || "R";
  const period = `${MONTHS[charge.periodMonth - 1]} ${charge.periodYear}`;
  const paid = charge.allocations
    .filter((a) => !a.receipt.voided)
    .reduce((s, a) => s + Number(a.amount), 0);
  const balance = amt - paid;

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          html, body { font-size: 11px; }
          .print-receipt { max-width: none !important; border-radius: 0 !important; }
          .print-receipt > header { padding: 12px 16px !important; }
          .print-receipt > header .h-14 { height: 2.25rem !important; width: 2.25rem !important; font-size: 0.625rem !important; letter-spacing: -0.02em; }
          .print-receipt section, .print-receipt > div { padding: 10px 16px !important; }
          .print-receipt table { font-size: 10px !important; }
          .print-receipt h1, .print-receipt h2 { font-size: 1rem !important; }
        }
      `}</style>
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">Sales Invoice {charge.invoiceNo ?? "(no number)"}</h1>
          {charge.voided && (
            <p className="mt-1"><Badge variant="destructive">VOIDED</Badge></p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/charges">Back</Link></Button>
          <PrintButton />
        </div>
      </div>

      <article className="print-receipt relative mx-auto max-w-3xl rounded-lg border bg-card shadow-sm overflow-hidden">
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
              <div className="text-xs uppercase tracking-widest text-emerald-100/80 print:text-emerald-700">Sales Invoice</div>
              <div className="mt-1 font-mono text-xl font-bold print:text-emerald-800">{charge.invoiceNo ?? "—"}</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 border-b bg-emerald-50/40 px-8 py-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice Date</div>
            <div className="font-medium">{format(charge.date, "dd MMM yyyy")}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Period</div>
            <div className="font-medium">{period}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="font-medium">
              {charge.voided ? "Voided" : balance <= 0.005 ? "Paid" : paid > 0 ? "Partial" : "Outstanding"}
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill to</div>
          <div className="mt-1 text-base font-semibold">{charge.resident.ownerName}</div>
          <div className="text-sm text-muted-foreground">{charge.resident.unitAddress}</div>
        </div>

        <div className="border-t px-8 py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 font-medium">Period</th>
                <th className="py-2 font-medium text-right">Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">{charge.description}</td>
                <td className="py-2 text-muted-foreground">
                  {charge.periodYear}-{String(charge.periodMonth).padStart(2, "0")}
                </td>
                <td className="py-2 text-right font-mono tabular">{fmtRM(amt)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 text-right text-sm font-medium">Total</td>
                <td className="pt-3 text-right font-mono tabular font-semibold">{fmtRM(amt)}</td>
              </tr>
              {paid > 0 && !charge.voided && (
                <>
                  <tr>
                    <td colSpan={2} className="pt-1 text-right text-xs text-muted-foreground">Paid</td>
                    <td className="pt-1 text-right font-mono tabular text-muted-foreground">({fmtRM(paid)})</td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="pt-1 text-right text-sm font-medium">Balance Due</td>
                    <td className="pt-1 text-right font-mono tabular font-semibold">{fmtRM(balance)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
          <div className="mt-4 text-sm font-medium text-foreground/80">{amountInWords(amt)}</div>
        </div>

        <footer className="flex justify-end px-8 pt-12 pb-8 text-xs text-muted-foreground">
          <div className="text-right">
            <div className="italic text-foreground/70">Computer Generated</div>
            <div className="mt-1 font-medium text-foreground/80">Treasurer</div>
            <div className="mt-0.5 text-[10px]">{association.name}</div>
          </div>
        </footer>

        <div className="border-t bg-muted/40 px-8 py-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Computer-generated · Please make payment to the association&apos;s designated bank account
        </div>

        {charge.voided && <div className="void-watermark" />}
      </article>
    </div>
  );
}
