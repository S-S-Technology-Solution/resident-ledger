import { Fragment } from "react";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { fmtRM } from "@/lib/money";
import { ringgitInWords } from "@/lib/receipts";
import { controlAccount, paymentMethodAccount } from "@/lib/control-accounts";
import type { ReceiptInput } from "@/lib/receipt-posting";
import type { CashEntryInput } from "@/lib/cash-book";
import type { SupplierPaymentInput } from "@/lib/bill-posting";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";
import { draftKindLabel } from "@/lib/draft-labels";
import { DraftActions } from "./draft-actions";

export const dynamic = "force-dynamic";

type Row = { label: string; value: React.ReactNode };

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen("drafts");
  const { id } = await params;
  const draft = await db.draft.findUnique({ where: { id } });
  if (!draft) notFound();
  const keyedBy = draft.createdBy ? (await db.user.findUnique({ where: { id: draft.createdBy } }))?.name : null;
  const amount = Number(draft.amount);

  const facts: Row[] = [];
  let detail: { cols: string[]; rows: string[][] } | null = null;
  // The journal entry posting will make, so the accountant sees the accounts too.
  let journal: { account: string; debit: number; credit: number }[] = [];
  const acc = async (id: string) => { const a = await db.account.findUnique({ where: { id } }); return a ? `${a.code} ${a.name}` : "—"; };

  if (draft.kind === "receipt") {
    const p = draft.payload as unknown as ReceiptInput;
    const r = await db.resident.findUnique({ where: { id: p.residentId } });
    const bank = await paymentMethodAccount(p.method);
    const ar = await controlAccount("AR");
    facts.push(
      { label: "Received from", value: p.receivedFrom || r?.ownerName },
      { label: "Unit", value: `${r?.unitAddress ?? "—"}${r?.debtorCode ? ` (${r.debtorCode})` : ""}` },
      { label: "Months paid for", value: p.periodFrom || p.periodTo ? `${p.periodFrom ?? "?"} to ${p.periodTo ?? "?"}` : "—" },
      { label: "Bank / Cash", value: p.method === "BANK" ? "Bank" : "Cash" },
      { label: "Cheque no.", value: p.chequeNo || "—" },
      { label: "Bank reference", value: p.bankRef || "—" },
    );
    if (p.allocations?.length) {
      const charges = await db.charge.findMany({ where: { id: { in: p.allocations.map((a) => a.chargeId) } } });
      detail = { cols: ["Applied to", "Period", "Amount"], rows: p.allocations.map((a) => {
        const c = charges.find((x) => x.id === a.chargeId);
        return [c?.description ?? "—", c ? `${c.periodYear}-${String(c.periodMonth).padStart(2, "0")}` : "", fmtRM(Number(a.amount))];
      }) };
    } else {
      facts.push({ label: "Applied to", value: "Oldest unpaid charges first, when posted" });
    }
    journal = [{ account: `${bank.code} ${bank.name}`, debit: amount, credit: 0 }, { account: `${ar.code} ${ar.name}`, debit: 0, credit: amount }];
  } else if (draft.kind === "cashEntry") {
    const p = draft.payload as unknown as CashEntryInput;
    const bank = await paymentMethodAccount(p.method === "CASH" ? "CASH" : "BANK");
    const isIn = p.direction === "IN";
    facts.push(
      { label: isIn ? "Paid by" : "Pay to", value: p.counterparty || "—" },
      { label: "Description", value: p.description },
      { label: "Payment for", value: p.paymentFor || "—" },
      { label: "Bank / Cash", value: p.method === "CASH" ? "Cash" : "Bank" },
      { label: "Cheque no.", value: p.chequeNo || "—" },
    );
    const lines = await Promise.all((p.lines ?? []).map(async (l) => ({ ...l, name: await acc(l.accountId) })));
    detail = { cols: ["Account", "Description", "Amount"], rows: lines.map((l) => [l.name, l.description ?? "", fmtRM(Number(l.amount))]) };
    const bankLine = { account: `${bank.code} ${bank.name}`, debit: isIn ? amount : 0, credit: isIn ? 0 : amount };
    const accLines = lines.map((l) => ({ account: l.name, debit: isIn ? 0 : Number(l.amount), credit: isIn ? Number(l.amount) : 0 }));
    journal = isIn ? [bankLine, ...accLines] : [...accLines, bankLine];
  } else {
    const p = draft.payload as unknown as SupplierPaymentInput;
    const bank = await paymentMethodAccount(p.method);
    const ap = await controlAccount("AP");
    const bills = await db.bill.findMany({ where: { id: { in: p.allocations.map((a) => a.billId) } } });
    facts.push(
      { label: "Pay to", value: draft.party },
      { label: "Payment for", value: p.paymentFor || "—" },
      { label: "Bank / Cash", value: p.method === "BANK" ? "Bank" : "Cash" },
      { label: "Cheque no.", value: p.chequeNo || "—" },
    );
    detail = { cols: ["Bill", "Bill date", "Amount"], rows: p.allocations.map((a) => {
      const b = bills.find((x) => x.id === a.billId);
      return [b?.invoiceNo ?? "—", b ? format(b.date, "dd MMM yyyy") : "", fmtRM(Number(a.amount))];
    }) };
    journal = [{ account: `${ap.code} ${ap.name}`, debit: amount, credit: 0 }, { account: `${bank.code} ${bank.name}`, debit: 0, credit: amount }];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Draft ${draft.number}`}
        description={`${draftKindLabel(draft)} · keyed by ${keyedBy ?? "—"} on ${format(draft.createdAt, "dd MMM yyyy, h:mm a")}`}
        actions={<Writable><DraftActions id={draft.id} number={draft.number} /></Writable>}
      />
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Not posted</Badge>
        <span className="text-muted-foreground">Nothing in the accounts changes until this is posted.</span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular">RM {fmtRM(amount)}</div>
          <div className="text-sm text-muted-foreground">{ringgitInWords(amount)}</div>
          <dl className="mt-4 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Date</dt><dd>{format(draft.date, "dd MMM yyyy")}</dd>
            {facts.map((f) => (
              <Fragment key={f.label}><dt className="text-muted-foreground">{f.label}</dt><dd>{f.value}</dd></Fragment>
            ))}
          </dl>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-2 text-sm font-medium">Will post as</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 font-medium">Account</th><th className="py-1.5 text-right font-medium">Debit</th><th className="py-1.5 text-right font-medium">Credit</th></tr></thead>
            <tbody>
              {journal.map((j, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">{j.account}</td>
                  <td className="py-1.5 text-right font-mono tabular">{j.debit ? fmtRM(j.debit) : ""}</td>
                  <td className="py-1.5 text-right font-mono tabular">{j.credit ? fmtRM(j.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="rounded-lg border bg-card p-5">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              {detail.cols.map((c, i) => <th key={c} className={`py-1.5 font-medium ${i === detail!.cols.length - 1 ? "text-right" : ""}`}>{c}</th>)}
            </tr></thead>
            <tbody>
              {detail.rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {r.map((v, j) => <td key={j} className={`py-1.5 ${j === r.length - 1 ? "text-right font-mono tabular" : ""}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
