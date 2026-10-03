"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { unwrap } from "@/lib/action";
import { createEntry } from "../actions";

type Account = { id: string; code: string; name: string };
type Line = { key: number; accountId: string; description: string; amount: string };

export function VoucherForm({
  direction, accounts, suggestedRefNo,
}: { direction: "IN" | "OUT"; accounts: Account[]; suggestedRefNo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isIn = direction === "IN";
  const [refNo, setRefNo] = useState(suggestedRefNo);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"BANK" | "CASH">("BANK");
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [paymentFor, setPaymentFor] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, accountId: "", description: "", amount: "" }]);

  const options = accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const total = lines.reduce((s, l) => s.plus(/^\d*\.?\d{0,2}$/.test(l.amount) && l.amount ? l.amount : 0), new Decimal(0));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const ready = refNo.trim() && description.trim() && lines.every((l) => l.accountId && l.amount) && total.gt(0);

  function submit() {
    start(async () => {
      try {
        const res = await unwrap(createEntry({
          direction, date, method, refNo,
          description, counterparty: counterparty || undefined, paymentFor: paymentFor || undefined,
          chequeNo: chequeNo || undefined, bankRef: bankRef || undefined,
          lines: lines.map(({ accountId, description, amount }) => ({ accountId, description, amount })),
        }));
        toast.success(`${isIn ? "Receipt" : "Payment voucher"} ${res.refNo} saved`);
        router.push(`/cash-book/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="v-no">{isIn ? "Receipt no." : "Voucher no."}</Label>
          <Input id="v-no" className="font-mono" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          <p className="text-xs text-muted-foreground">{isIn ? "Suggested next number — change it to match your book" : "As written on the payment voucher"}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-date">Date</Label>
          <Input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Bank / Cash</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as "BANK" | "CASH")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK">RHB Bank</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="v-party">{isIn ? "Paid by" : "Pay to"}</Label>
          <Input id="v-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={isIn ? "e.g. RHB Bank, ADUN office" : "e.g. Tenaga Nasional Berhad"} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-chq">Cheque no.</Label>
          <Input id="v-chq" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder={method === "BANK" && !isIn ? "e.g. 956" : ""} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="v-desc">Description</Label>
          <Input id="v-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isIn ? "e.g. Bank interest for September" : "e.g. Electricity for guard house"} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-for">Payment for</Label>
          <Input id="v-for" value={paymentFor} onChange={(e) => setPaymentFor(e.target.value)} placeholder="e.g. Sep 2026 bill no. 1234" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-ref">Bank reference (optional)</Label>
          <Input id="v-ref" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-[1fr_1fr_9rem_2.5rem] gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{isIn ? "Income account" : "Expense account"}</span><span>Line description</span><span className="text-right">Amount (RM)</span><span />
        </div>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_1fr_9rem_2.5rem] items-center gap-2 border-b px-3 py-2 last:border-0">
            <Combobox options={options} value={l.accountId} onChange={(v) => update(l.key, { accountId: v })} placeholder="Search account" />
            <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Optional" />
            <Input inputMode="decimal" className="text-right font-mono" value={l.amount}
              onChange={(e) => { if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) update(l.key, { amount: e.target.value }); }} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2">
          <Button type="button" variant="outline" size="sm"
            onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, accountId: "", description: "", amount: "" }])}>
            <Plus className="mr-1 h-4 w-4" /> Add line
          </Button>
          <span className="text-sm">Total <span className="ml-2 font-mono text-base font-semibold tabular">RM {fmtRM(total.toNumber())}</span></span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={pending || !ready} onClick={submit}>{pending ? "Saving…" : isIn ? "Save receipt" : "Save voucher"}</Button>
      </div>
    </div>
  );
}
