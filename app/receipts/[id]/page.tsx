import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { amountInWords } from "@/lib/receipts";
import { Badge } from "@/components/ui/badge";
import { VoidReceiptButton } from "./void-receipt-button";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ReceiptViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: { resident: true, allocations: { include: { charge: true } } },
  });
  if (!receipt) notFound();
  const association = await getAssociation();
  const amt = Number(receipt.amount);

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          html, body { font-size: 11px; }
          .print-receipt { max-width: none !important; border-radius: 0 !important; }
          .print-receipt > header { padding: 12px 16px !important; }
          .print-receipt > header .h-14 { height: 2.25rem !important; width: 2.25rem !important; font-size: 1rem !important; }
          .print-receipt section, .print-receipt > div { padding: 10px 16px !important; }
          .print-receipt table { font-size: 10px !important; }
          .print-receipt h1, .print-receipt h2 { font-size: 1rem !important; }
        }
      `}</style>
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">Receipt {receipt.receiptNo}</h1>
          {receipt.voided && (
            <p className="mt-1"><Badge variant="destructive">VOIDED — {receipt.voidReason}</Badge></p>
          )}
        </div>
        <div className="flex gap-2">
          <PrintButton />
          {!receipt.voided && <VoidReceiptButton id={receipt.id} />}
        </div>
      </div>

      <article className="print-receipt relative mx-auto max-w-3xl rounded-lg border bg-card shadow-sm overflow-hidden">
        {/* Letterhead */}
        <header className="relative bg-gradient-to-r from-emerald-700 to-emerald-800 px-8 py-6 text-emerald-50 print:bg-white print:bg-none print:text-emerald-800">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-white/15 text-2xl font-black ring-1 ring-white/30 print:bg-emerald-100 print:text-emerald-800 print:ring-emerald-300">
              {association.name
                .split(" ")
                .filter((w) => /^[A-Z]/.test(w))
                .slice(0, 2)
                .map((w) => w[0])
                .join("") || "R"}
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
              <div className="text-xs uppercase tracking-widest text-emerald-100/80 print:text-emerald-700">Official Receipt</div>
              <div className="mt-1 font-mono text-xl font-bold print:text-emerald-800">{receipt.receiptNo}</div>
            </div>
          </div>
        </header>

        {/* Meta strip */}
        <div className="grid grid-cols-2 gap-4 border-b bg-emerald-50/40 px-8 py-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</div>
            <div className="font-medium">{format(receipt.date, "dd MMM yyyy")}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Method</div>
            <div className="font-medium">{receipt.method === "BANK" ? "Bank Transfer" : "Cash"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reference</div>
            <div className="font-medium font-mono">{receipt.bankRef || "—"}</div>
          </div>
        </div>

        {/* Resident + Amount */}
        <div className="grid grid-cols-1 gap-6 px-8 py-6 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Received from</div>
            <div className="mt-1 text-base font-semibold">{receipt.resident.ownerName}</div>
            <div className="text-sm text-muted-foreground">{receipt.resident.unitAddress}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
            <div className="mt-1 font-mono text-4xl font-bold text-emerald-800 tabular">RM {fmtRM(amt)}</div>
            <div className="mt-1 text-sm font-medium text-foreground/80">{amountInWords(amt)}</div>
          </div>
        </div>

        {/* Allocations */}
        <div className="border-t px-8 py-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Being payment for</div>
          {receipt.allocations.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Unapplied payment — held as credit on account</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 font-medium text-right">Applied</th>
                </tr>
              </thead>
              <tbody>
                {receipt.allocations.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2">{a.charge.description}</td>
                    <td className="py-2 text-muted-foreground">
                      {a.charge.periodYear}-{String(a.charge.periodMonth).padStart(2, "0")}
                    </td>
                    <td className="py-2 text-right font-mono tabular">{fmtRM(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Signatures */}
        <footer className="grid grid-cols-2 gap-12 px-8 pt-16 pb-8 text-xs text-muted-foreground">
          <div>
            <div className="border-t border-foreground/40 pt-1.5">Resident&apos;s Signature</div>
          </div>
          <div className="text-right">
            <div className="border-t border-foreground/40 pt-1.5">Treasurer</div>
            <div className="mt-1 text-[10px]">{association.name}</div>
          </div>
        </footer>

        <div className="border-t bg-muted/40 px-8 py-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Computer-generated · Valid without physical seal
        </div>

        {receipt.voided && <div className="void-watermark" />}
      </article>
    </div>
  );
}
