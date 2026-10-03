import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { ringgitInWords } from "@/lib/receipts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/app/receipts/[id]/print-button";
import { VoidPaymentButton } from "@/app/bills/[id]/void-payment-button";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";

export const dynamic = "force-dynamic";

/** A supplier payment voucher: the cheque and every bill it settled. */
export default async function SupplierVoucherPage({ params }: { params: Promise<{ entryId: string }> }) {
  await requireScreen("bills");
  const { entryId } = await params;
  const rows = await db.billPayment.findMany({
    where: { entryId },
    include: { bill: { include: { supplier: true } } },
    orderBy: { bill: { date: "asc" } },
  });
  if (!rows.length) notFound();
  const entry = await db.journalEntry.findUnique({ where: { id: entryId }, select: { entryNo: true, status: true, voidReason: true } });
  const association = await getAssociation();
  const first = rows[0];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A5 portrait; margin: 8mm; } .print-doc { box-shadow: none !important; } }`}</style>
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">Payment voucher {first.voucherNo}</h1>
          {entry?.status === "VOIDED" && <Badge variant="destructive">VOIDED — {entry.voidReason}</Badge>}
        </div>
        <div className="flex gap-2">
          <PrintButton />
          {first.method === "BANK" && (
            <Button variant="outline" asChild><Link href={`/cheque/bill/${first.id}`}>Print cheque</Link></Button>
          )}
          <Writable><VoidPaymentButton id={first.id} /></Writable>
        </div>
      </div>

      <article className="print-doc mx-auto max-w-3xl rounded-lg border bg-card p-8 shadow-sm">
        <header className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="text-lg font-semibold uppercase">{association.name}</div>
            {association.registrationNo && <div className="text-xs text-muted-foreground">{association.registrationNo}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Payment Voucher</div>
            <div className="font-mono text-xl font-bold">{first.voucherNo}</div>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 text-sm sm:grid-cols-4">
          <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</dt><dd className="font-medium">{format(first.date, "dd MMM yyyy")}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Bank / Cash</dt><dd className="font-medium">{first.method === "BANK" ? "RHB Bank" : "Cash"}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Cheque no.</dt><dd className="font-mono">{first.chequeNo ?? "—"}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Journal</dt><dd className="font-mono">{entry?.entryNo ?? "—"}</dd></div>
          <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Pay to</dt><dd className="text-base font-semibold">{first.bill.supplier.name}</dd></div>
          <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment for</dt><dd>{first.paymentFor ?? "Settlement of the invoices below"}</dd></div>
        </dl>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Invoice</th>
              <th className="py-1.5 font-medium">Invoice date</th>
              <th className="py-1.5 text-right font-medium">Amount paid (RM)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1.5"><Link href={`/bills/${r.billId}`} className="font-mono underline-offset-2 hover:underline">{r.bill.invoiceNo}</Link></td>
                <td className="py-1.5">{format(r.bill.date, "dd MMM yyyy")}</td>
                <td className="py-1.5 text-right font-mono tabular">{fmtRM(Number(r.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 text-right text-xs font-medium">Total</td>
              <td className="pt-2 text-right font-mono text-base font-semibold tabular">{fmtRM(total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-sm"><span className="text-muted-foreground">Ringgit Malaysia:</span> {ringgitInWords(total)}</p>

        <footer className="mt-12 grid grid-cols-3 gap-6 text-xs text-muted-foreground">
          {["Prepared by", "Approved by", "Received by"].map((who) => (
            <div key={who}>
              <div className="h-10 border-b border-dashed" />
              <div className="mt-1 font-medium text-foreground/80">{who}</div>
              {who === "Received by" && <div className="mt-0.5 text-[10px]">Name / IC / Date</div>}
            </div>
          ))}
        </footer>
      </article>
    </div>
  );
}
