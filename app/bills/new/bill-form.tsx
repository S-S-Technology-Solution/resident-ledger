"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Percent, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { createBill } from "../actions";
import { unwrap } from "@/lib/action";
import { fmtRM } from "@/lib/money";

// A line is either a plain amount or a charge worked out as a percentage of
// the plain lines (e.g. service charge 8%), recalculated as they change.
type Line = { key: number; accountId: string; description: string; amount: string; rate: string | null };
const isMoney = (v: string) => /^\d*\.?\d{0,2}$/.test(v);

export function BillForm({
  suppliers,
  expenseAccounts,
}: {
  suppliers: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoice] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, accountId: "", description: "", amount: "", rate: null }]);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"BILL" | "CREDIT_NOTE">("BILL");

  const base = lines.filter((l) => l.rate === null).reduce((s, l) => s.plus(isMoney(l.amount) && l.amount ? l.amount : 0), new Decimal(0));
  const amountOf = (l: Line) =>
    l.rate === null
      ? new Decimal(isMoney(l.amount) && l.amount ? l.amount : 0)
      : base.times(l.rate || 0).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const total = lines.reduce((s, l) => s.plus(amountOf(l)), new Decimal(0));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const nextKey = () => Math.max(...lines.map((x) => x.key)) + 1;
  const ready = supplierId && invoiceNo.trim() && lines.every((l) => l.accountId && amountOf(l).gt(0));
  const options = expenseAccounts.map((a) => ({ value: a.id, label: a.name, hint: a.code }));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="b-kind" checked={kind === "BILL"} onChange={() => setKind("BILL")} /> Supplier invoice
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="b-kind" checked={kind === "CREDIT_NOTE"} onChange={() => setKind("CREDIT_NOTE")} />
          Supplier credit note <span className="text-muted-foreground">(adds to what we owe)</span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Supplier</Label>
          <Combobox
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Search supplier…"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="space-y-1">
          <Label>{kind === "BILL" ? "Invoice #" : "Credit note #"}</Label>
          <Input value={invoiceNo} onChange={(e) => setInvoice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Due date (optional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description (optional)</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-[1fr_1fr_5.5rem_8rem_2.5rem] gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Expense category</span><span>Line description</span><span className="text-right">%</span><span className="text-right">Amount (RM)</span><span />
        </div>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_1fr_5.5rem_8rem_2.5rem] items-center gap-2 border-b px-3 py-2 last:border-0">
            <Combobox options={options} value={l.accountId} onChange={(v) => update(l.key, { accountId: v })} placeholder="Search category…" />
            <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })}
              placeholder={l.rate === null ? "e.g. Security services Jan 2026" : "Service charge"} />
            {l.rate === null ? <span className="text-right text-xs text-muted-foreground">—</span> : (
              <Input inputMode="decimal" aria-label="Percentage" className="text-right font-mono" value={l.rate}
                onChange={(e) => {
                  if (!/^\d*\.?\d{0,4}$/.test(e.target.value)) return;
                  // Keep "Service charge 8%" in step with the rate unless it was reworded.
                  const auto = /^Service charge [\d.]*%$/.test(l.description);
                  update(l.key, { rate: e.target.value, ...(auto ? { description: `Service charge ${e.target.value}%` } : {}) });
                }} />
            )}
            {l.rate === null ? (
              <Input inputMode="decimal" aria-label="Amount" className="text-right font-mono" value={l.amount}
                onChange={(e) => { if (!e.target.value || isMoney(e.target.value)) update(l.key, { amount: e.target.value }); }} />
            ) : (
              <span className="pr-3 text-right font-mono tabular" title={`${l.rate || 0}% of RM ${fmtRM(base.toNumber())}`}>{fmtRM(amountOf(l).toNumber())}</span>
            )}
            <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm"
              onClick={() => setLines((ls) => [...ls, { key: nextKey(), accountId: "", description: "", amount: "", rate: null }])}>
              <Plus className="mr-1 h-4 w-4" /> Add line
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setLines((ls) => [...ls, {
                key: nextKey(), accountId: ls.find((x) => x.rate === null)?.accountId ?? "", description: "Service charge 8%", amount: "", rate: "8",
              }])}>
              <Percent className="mr-1 h-4 w-4" /> Add % charge
            </Button>
          </div>
          <span className="text-sm">Invoice total <span className="ml-2 font-mono text-base font-semibold tabular">RM {fmtRM(total.toNumber())}</span></span>
        </div>
      </div>
      {lines.some((l) => l.rate !== null) && (
        <p className="text-xs text-muted-foreground">
          A % charge is worked out on the lines without a %: RM {fmtRM(base.toNumber())}. Change the % if the rate isn&apos;t 8%.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          disabled={pending || !ready}
          onClick={() => start(async () => {
            try {
              const b = await unwrap(createBill({
                supplierId, invoiceNo, date, dueDate: dueDate || undefined, description: description || undefined, kind,
                lines: lines.map((l) => ({
                  accountId: l.accountId, description: l.description, amount: amountOf(l).toFixed(2), rate: l.rate ?? undefined,
                })),
              }));
              toast.success("Bill recorded");
              router.push(`/bills/${b.id}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}
        >{pending ? "Saving…" : "Save bill"}</Button>
      </div>
    </div>
  );
}
