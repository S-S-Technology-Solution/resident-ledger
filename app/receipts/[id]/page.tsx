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
