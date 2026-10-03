"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { unwrap } from "@/lib/action";
import { paySupplier } from "../actions";

type Bill = { id: string; supplierId: string; invoiceNo: string; date: string; open: string };

export function PayForm({
  suppliers, bills, defaultSupplierId, defaultBillId, suggestedVoucherNo,
}: {
  suppliers: { id: string; name: string }[];
  bills: Bill[];
  defaultSupplierId: string;
  defaultBillId?: string;
  suggestedVoucherNo: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"BANK" | "CASH">("BANK");
  const [voucherNo, setVoucherNo] = useState(suggestedVoucherNo);
  const [chequeNo, setChequeNo] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [paymentFor, setPaymentFor] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const b = bills.find((x) => x.id === defaultBillId);
    return b ? { [b.id]: b.open } : {};
  });

  const open = bills.filter((b) => b.supplierId === supplierId);
  const total = open.reduce((s, b) => s.plus(/^\d*\.?\d{0,2}$/.test(amounts[b.id] ?? "") && amounts[b.id] ? amounts[b.id] : 0), new Decimal(0));
  const over = open.some((b) => new Decimal(amounts[b.id] || 0).gt(b.open));

  function submit() {
    start(async () => {
      try {
        const res = await unwrap(paySupplier({
          supplierId, date, method, voucherNo, chequeNo: chequeNo || undefined, bankRef: bankRef || undefined,
          paymentFor: paymentFor || undefined,
          allocations: open.filter((b) => new Decimal(amounts[b.id] || 0).gt(0)).map((b) => ({ billId: b.id, amount: amounts[b.id] })),
        }));
        toast.success(`Payment voucher ${res.voucherNo} saved — RM ${fmtRM(Number(res.total))}`);
        router.push(`/bills/voucher/${res.entryId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>Supplier</Label>
          <Combobox
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={(v) => { setSupplierId(v); setAmounts({}); }}
            placeholder="Suppliers with unpaid bills"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-date">Date</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-pv">Voucher no.</Label>
          <Input id="p-pv" className="font-mono" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
          <p className="text-xs text-muted-foreground">As written on the payment voucher</p>
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
        <div className="space-y-1">
          <Label htmlFor="p-chq">Cheque no.</Label>
          <Input id="p-chq" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="p-for">Payment for</Label>
          <Input id="p-for" value={paymentFor} onChange={(e) => setPaymentFor(e.target.value)} placeholder="e.g. Security guard services, August 2026" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-ref">Bank reference (optional)</Label>
          <Input id="p-ref" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </div>
      </div>

      {supplierId && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
            <span>Unpaid bills</span>
            <Button size="sm" variant="outline" onClick={() => setAmounts(Object.fromEntries(open.map((b) => [b.id, b.open])))}>
              Pay all in full
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_8rem_8rem_9rem] gap-2 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Bill</span><span>Date</span><span className="text-right">Owing</span><span className="text-right">Pay now (RM)</span>
          </div>
          {open.map((b) => (
            <div key={b.id} className="grid grid-cols-[1fr_8rem_8rem_9rem] items-center gap-2 border-b px-4 py-2 last:border-0 text-sm">
              <span className="font-mono">{b.invoiceNo}</span>
              <span>{b.date}</span>
              <span className="text-right font-mono tabular">{fmtRM(Number(b.open))}</span>
              <Input inputMode="decimal" className="text-right font-mono" value={amounts[b.id] ?? ""}
                onChange={(e) => { if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) setAmounts((m) => ({ ...m, [b.id]: e.target.value })); }} />
            </div>
          ))}
          <div className="flex justify-end gap-6 px-4 py-3 text-sm">
            {over && <span className="text-rose-700">A payment is more than the bill still owes.</span>}
            <span>Voucher total <span className="ml-2 font-mono text-base font-semibold tabular">RM {fmtRM(total.toNumber())}</span></span>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={pending || !supplierId || !voucherNo.trim() || total.lte(0) || over} onClick={submit}>
          {pending ? "Saving…" : "Save payment voucher"}
        </Button>
      </div>
    </div>
  );
}
