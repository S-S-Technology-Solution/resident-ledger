import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { amountInWords } from "@/lib/receipts";
import { PrintButton } from "@/app/receipts/[id]/print-button";

export const dynamic = "force-dynamic";

/**
 * Printable cheque. Laid out for a standard Malaysian cheque leaf, so the page
 * prints at a fixed size and everything sits where the pre-printed fields are.
 * Adjust the offsets below if your bank's leaf differs.
 */
export default async function ChequePage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  const association = await getAssociation();

  let payee = "";
  let amount = 0;
  let date = new Date();
  let reference = "";

  if (kind === "bill") {
    const payment = await db.billPayment.findUnique({
      where: { id },
      include: { bill: { include: { supplier: true } } },
    });
    if (!payment) notFound();
    payee = payment.bill.supplier.name;
    amount = Number(payment.amount);
    date = payment.date;
    reference = payment.bill.invoiceNo;
  } else if (kind === "cash") {
    const entry = await db.cashEntry.findUnique({ where: { id } });
    if (!entry || entry.direction !== "OUT") notFound();
    payee = entry.counterparty || entry.description;
    amount = Number(entry.amount);
    date = entry.date;
    reference = entry.refNo;
  } else {
    notFound();
  }

  const dd = format(date, "dd");
  const mm = format(date, "MM");
  const yyyy = format(date, "yyyy");

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: 180mm 80mm; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .cheque { width: 180mm; height: 80mm; border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">Print cheque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {reference} · {payee}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="cheque relative mx-auto rounded-lg border bg-card shadow-sm"
           style={{ width: "180mm", height: "80mm" }}>
        {/* Date boxes, top right */}
        <div className="absolute flex gap-1 font-mono text-sm" style={{ top: "10mm", right: "12mm" }}>
          {[...dd, ...mm, ...yyyy].map((ch, i) => (
            <span
              key={i}
              className="grid h-6 w-5 place-items-center border-b border-dotted border-slate-400"
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Payee */}
        <div className="absolute" style={{ top: "24mm", left: "18mm", right: "50mm" }}>
          <div className="border-b border-dotted border-slate-400 pb-0.5 text-sm font-medium">
            {payee}
          </div>
        </div>

        {/* Amount in words, two lines as on a real leaf */}
        <div className="absolute" style={{ top: "36mm", left: "18mm", right: "50mm" }}>
          <div className="border-b border-dotted border-slate-400 pb-0.5 text-xs">
            {amountInWords(amount)}
          </div>
          <div className="mt-3 border-b border-dotted border-slate-400" />
        </div>

        {/* Amount in figures */}
        <div className="absolute" style={{ top: "34mm", right: "12mm" }}>
          <div className="rounded border border-slate-400 px-3 py-1 font-mono text-sm font-semibold">
            **{fmtRM(amount)}
          </div>
        </div>

        {/* Signature block */}
        <div className="absolute text-right" style={{ bottom: "12mm", right: "12mm" }}>
          <div className="h-8 w-48 border-b border-slate-400" />
          <div className="mt-1 text-[10px] text-muted-foreground">{association.name}</div>
        </div>

        {/* Crossing, top left */}
        <div className="absolute text-[9px] uppercase tracking-widest text-muted-foreground"
             style={{ top: "8mm", left: "14mm" }}>
          Account payee only
        </div>
      </div>

      <p className="mx-auto max-w-2xl text-center text-xs text-muted-foreground no-print">
        Load a blank cheque leaf and print. The page is sized 180mm × 80mm with no margins — if the
        fields sit slightly off for your bank, the offsets are at the top of this file.
      </p>
    </div>
  );
}
