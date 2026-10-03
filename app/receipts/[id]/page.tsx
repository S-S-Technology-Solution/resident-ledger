import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { ringgitInWords } from "@/lib/receipts";
import { Badge } from "@/components/ui/badge";
import { VoidReceiptButton } from "./void-receipt-button";
import { PrintButton } from "./print-button";
import { ChequeReturnButton } from "./cheque-return-button";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";

export const dynamic = "force-dynamic";

export default async function ReceiptViewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen("receipts");
  const { id } = await params;
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: { resident: true, allocations: { include: { charge: true } } },
  });
  if (!receipt) notFound();
  const association = await getAssociation();
  const amt = Number(receipt.amount);
  if (receipt.method === "CREDIT_NOTE") return <CreditNote receipt={receipt} associationName={association.name} />;

  // "In Payment Of": the months written on the receipt, or else the months it settled.
  const periods = receipt.allocations
    .map((a) => `${a.charge.periodYear}-${String(a.charge.periodMonth).padStart(2, "0")}`)
    .sort();
  const fromMonth = receipt.periodFrom ?? periods[0] ?? null;
  const toMonth = receipt.periodTo ?? periods.at(-1) ?? null;
  const monthLabel = (ym: string | null) => (ym ? format(new Date(`${ym}-01T00:00:00`), "MMM yyyy") : "");
  const [prefix, digits] = (receipt.receiptNo.match(/^([A-Z]*)(.*)$/) ?? ["", "", receipt.receiptNo]).slice(1);

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A5 landscape; margin: 6mm; }
          .print-receipt { max-width: none !important; box-shadow: none !important; }
        }
        .or { --or-ink: #157347; --or-fill: #e3f4ec; --or-line: #3a9a6a; font-family: "Times New Roman", Times, Georgia, serif; }
        .or-box { border: 1.5px solid var(--or-line); border-radius: 8px; }
        .or-lab { font-size: 11px; line-height: 1.15; color: var(--or-ink); }
        .or-lab i { font-style: italic; }
        .or-hand { font-family: ui-sans-serif, system-ui, sans-serif; color: #1f3a8a; }
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
          {!receipt.voided && (
            <Writable><ChequeReturnButton id={receipt.id} receiptNo={receipt.receiptNo} /></Writable>
          )}
          {!receipt.voided && <Writable><VoidReceiptButton id={receipt.id} /></Writable>}
        </div>
      </div>

      {/* Laid out like the association's printed Official Receipt Book. */}
      <article className="or print-receipt relative mx-auto max-w-4xl overflow-hidden rounded-md border bg-[var(--or-fill)] p-6 shadow-sm">
        <header>
          <div className="text-[26px] font-bold uppercase leading-none tracking-tight text-[var(--or-ink)]">
            {association.name}
          </div>
          {association.registrationNo && (
            <div className="mt-1 text-[11px] text-[var(--or-ink)]">{association.registrationNo}</div>
          )}
        </header>

        <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <div className="or-box px-3 py-1.5 text-center leading-tight text-[var(--or-ink)]">
            <div className="text-2xl font-bold tracking-wide">RESIT RASMI</div>
            <div className="text-xl italic">Official Receipt</div>
          </div>
          <div className="or-box px-3 py-1.5">
            <div className="or-lab">TARIKH / <i>Date</i> 日期</div>
            <div className="or-hand mt-1 text-lg">{format(receipt.date, "d-M-yyyy")}</div>
          </div>
          <div className="or-box px-3 py-1.5">
            <div className="or-lab font-bold">RESIT NO. / <i>Receipt No.</i> 号码</div>
            <div className="mt-1 flex items-baseline gap-2 text-[var(--or-ink)]">
              <span className="text-xl font-bold">No: {prefix}</span>
              <span className="font-mono text-2xl tracking-wider text-red-700">{digits}</span>
            </div>
          </div>
        </div>

        <div className="or-box mt-2 divide-y divide-[var(--or-line)]">
          <div className="grid grid-cols-[9rem_1fr_auto] items-end gap-3 px-3 py-2">
            <div className="or-lab">Diterima Dari<br /><i>Received From</i> 兹收</div>
            <div className="or-hand text-lg">{receipt.receivedFrom || receipt.resident.ownerName}</div>
            <div className="or-hand text-lg">{receipt.resident.unitAddress}</div>
          </div>
          <div className="grid grid-cols-[9rem_1fr] items-end gap-3 px-3 py-2">
            <div className="or-lab">Wang Yang Diterima<br /><i>The Sum Of Ringgit</i> 来银</div>
            <div className="or-hand text-lg">{ringgitInWords(amt)}</div>
          </div>
          <div className="h-8" />
          <div className="grid grid-cols-[9rem_1fr] items-end gap-3 px-3 py-2">
            <div className="or-lab">Untuk Bayaran<br /><i>In Payment Of</i> 付还</div>
            <div className="text-lg text-[var(--or-ink)]">
              Security Fee for the month of{" "}
              <span className="or-hand inline-block min-w-28 border-b border-[var(--or-line)] text-center">{monthLabel(fromMonth)}</span>
              {" "}to{" "}
              <span className="or-hand inline-block min-w-28 border-b border-[var(--or-line)] text-center">{monthLabel(toMonth)}</span>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_1.8fr] gap-3">
          <div className="space-y-1.5">
            <div className="or-box flex items-baseline gap-2 px-3 py-2 text-[var(--or-ink)]">
              <span className="text-xl">RM</span>
              <span className="or-hand text-xl tabular">{fmtRM(amt)}</span>
            </div>
            <div className="or-box divide-y divide-[var(--or-line)] text-sm">
              <div className="flex gap-2 px-3 py-1">
                <span className="or-lab">Bank / Cash</span>
                <span className="or-hand">{receipt.method === "BANK" ? "Bank" : "Cash"}{receipt.bankRef ? ` · ${receipt.bankRef}` : ""}</span>
              </div>
              <div className="flex gap-2 px-3 py-1">
                <span className="or-lab">Cheque No.</span>
                <span className="or-hand">{receipt.chequeNo ?? ""}</span>
              </div>
            </div>
          </div>
          <div className="or-box flex flex-col justify-between px-3 py-2">
            <div className="text-center text-xl text-[var(--or-ink)]">Treasurer</div>
            <div className="mt-6 flex items-end justify-between gap-3">
              <span className="or-lab">Yang Menerima / Issued By / 发据人</span>
              <span className="rounded-sm bg-[#c7ebd9] px-2 py-1 text-xs text-[var(--or-ink)]">{association.name}</span>
            </div>
          </div>
        </div>

        <div className="mt-2 text-center text-[10px] uppercase tracking-widest text-[var(--or-ink)]/70">
          Computer-generated receipt
        </div>

        {receipt.voided && <div className="void-watermark" />}
      </article>
    </div>
  );
}

/** A resident credit note: no money changed hands, so it is not an Official Receipt. */
function CreditNote({ receipt, associationName }: {
  receipt: { receiptNo: string; date: Date; amount: unknown; receivedFrom: string | null; voided: boolean; voidReason: string | null;
    resident: { ownerName: string; unitAddress: string };
    allocations: { id: string; amount: unknown; charge: { description: string; periodYear: number; periodMonth: number } }[] };
  associationName: string;
}) {
  const amt = Number(receipt.amount);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold">Credit note {receipt.receiptNo}</h1>
          {receipt.voided && <Badge variant="destructive">VOIDED — {receipt.voidReason}</Badge>}
        </div>
        <div className="flex gap-2"><PrintButton /></div>
      </div>
      <article className="print-receipt mx-auto max-w-3xl rounded-lg border bg-card p-8 shadow-sm">
        <header className="flex items-start justify-between border-b pb-4">
          <div className="text-lg font-semibold uppercase">{associationName}</div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Credit Note</div>
            <div className="font-mono text-xl font-bold">{receipt.receiptNo}</div>
            <div className="text-sm">{format(receipt.date, "dd MMM yyyy")}</div>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">To</div>
            <div className="font-semibold">{receipt.resident.ownerName}</div>
            <div className="text-sm text-muted-foreground">{receipt.resident.unitAddress}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount credited</div>
            <div className="font-mono text-3xl font-bold tabular">RM {fmtRM(amt)}</div>
            <div className="text-sm">{ringgitInWords(amt)}</div>
          </div>
        </div>
        <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {receipt.receivedFrom}</p>
        {receipt.allocations.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 font-medium">Charge reduced</th><th className="py-1.5 font-medium">Period</th><th className="py-1.5 text-right font-medium">Amount</th></tr></thead>
            <tbody>
              {receipt.allocations.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-1.5">{a.charge.description}</td>
                  <td className="py-1.5">{a.charge.periodYear}-{String(a.charge.periodMonth).padStart(2, "0")}</td>
                  <td className="py-1.5 text-right font-mono tabular">{fmtRM(Number(a.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="mt-12 flex justify-end text-xs text-muted-foreground">
          <div className="w-48 text-center"><div className="h-10 border-b border-dashed" /><div className="mt-1 font-medium text-foreground/80">Treasurer</div></div>
        </footer>
      </article>
    </div>
  );
}
