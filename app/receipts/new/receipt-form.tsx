"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { createReceipt } from "../actions";
import { updateDraft } from "@/app/drafts/actions";
import type { ReceiptInput } from "@/lib/receipt-posting";
import { fetchOutstanding } from "./outstanding-action";
import { unwrap } from "@/lib/action";

type ResidentOpt = { id: string; unitAddress: string; ownerName: string };
type Charge = { id: string; description: string; periodMonth: number; periodYear: number; open: string };

export function ReceiptForm({
  residents,
  defaultResidentId,
  initialOpen,
  suggestedReceiptNo,
  draftId,
  initial,
}: {
  residents: ResidentOpt[];
  defaultResidentId?: string;
  initialOpen: Charge[];
  suggestedReceiptNo: string;
  // Editing a draft: its id and what was keyed.
  draftId?: string;
  initial?: Partial<ReceiptInput>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date();
  const [residentId, setResidentId] = useState(defaultResidentId ?? "");
  const [date, setDate] = useState(initial?.date ?? today.toISOString().slice(0, 10));
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [method, setMethod] = useState<"CASH" | "BANK">(initial?.method ?? "BANK");
  const [bankRef, setBankRef] = useState(initial?.bankRef ?? "");
  const [receiptNo, setReceiptNo] = useState(initial?.receiptNo ?? suggestedReceiptNo);
  const ownerOf = (id: string) => residents.find((r) => r.id === id)?.ownerName ?? "";
  const [receivedFrom, setReceivedFrom] = useState(initial?.receivedFrom ?? (defaultResidentId ? ownerOf(defaultResidentId) : ""));
  const [periodFrom, setPeriodFrom] = useState(initial?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(initial?.periodTo ?? "");
  const [chequeNo, setChequeNo] = useState(initial?.chequeNo ?? "");

  // "Received From" starts as the owner but is whoever actually paid, as written on the receipt.
  function pickResident(id: string) {
    if (!receivedFrom || receivedFrom === ownerOf(residentId)) setReceivedFrom(ownerOf(id));
    setResidentId(id);
  }
  const [open, setOpen] = useState<Charge[]>(initialOpen);
  const [allocs, setAllocs] = useState<Record<string, string>>(
    Object.fromEntries((initial?.allocations ?? []).map((a) => [a.chargeId, a.amount])),
  );

  useEffect(() => {
    if (!residentId) { setOpen([]); return; }
    unwrap(fetchOutstanding(residentId)).then(setOpen);
  }, [residentId]);

  const totalOutstanding = useMemo(
    () => open.reduce((s, c) => s.plus(new Decimal(c.open)), new Decimal(0)),
    [open],
  );
  const allocTotal = useMemo(
    () => Object.values(allocs).reduce((s, v) => s.plus(new Decimal(v || 0)), new Decimal(0)),
    [allocs],
  );
  const amt = new Decimal(amount || 0);
  const remaining = amt.minus(allocTotal);

  function autoAllocate() {
    let remaining = amt;
    const next: Record<string, string> = {};
    for (const c of open) {
      if (remaining.lte(0)) break;
      const take = Decimal.min(new Decimal(c.open), remaining);
      next[c.id] = take.toFixed(2);
      remaining = remaining.minus(take);
    }
    setAllocs(next);
  }

  const overpay = amt.gt(totalOutstanding);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="r-no">Receipt no.</Label>
          <Input id="r-no" className="font-mono" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
          <p className="text-xs text-muted-foreground">As printed in the Official Receipt Book</p>
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="hidden sm:block" />
        <div className="space-y-1 sm:col-span-2">
          <Label>Unit</Label>
          <Combobox
            value={residentId}
            onChange={pickResident}
            placeholder="Search resident…"
            options={residents.map((r) => ({ value: r.id, label: r.unitAddress, hint: r.ownerName }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-from">Received from</Label>
          <Input id="r-from" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} placeholder="Name of the payer" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-pf">Security fee from (month)</Label>
          <Input id="r-pf" type="month" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-pt">To (month)</Label>
          <Input id="r-pt" type="month" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Amount (RM)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as "CASH" | "BANK")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK">Bank Transfer</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-chq">Cheque no. (if by cheque)</Label>
          <Input id="r-chq" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Bank reference (optional)</Label>
          <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </div>
      </div>

      {residentId && (
        <div className="rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
            <div>
              Outstanding: <span className="font-mono">{fmtRM(totalOutstanding)}</span>
              {overpay && <span className="ml-3 text-amber-600">⚠ Receipt exceeds outstanding by {fmtRM(amt.minus(totalOutstanding))}</span>}
            </div>
            <Button size="sm" variant="outline" onClick={autoAllocate} disabled={!amount}>Auto-allocate (FIFO)</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right w-40">Apply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.description}</TableCell>
                  <TableCell>{c.periodYear}-{String(c.periodMonth).padStart(2, "0")}</TableCell>
                  <TableCell className="text-right font-mono">{fmtRM(c.open)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="decimal"
                      className="text-right font-mono"
                      value={allocs[c.id] ?? ""}
                      onChange={(e) => setAllocs((p) => ({ ...p, [c.id]: e.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {open.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-6">No open charges.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-6 border-t px-4 py-3 text-sm font-mono">
            <span>Allocated: <b>{fmtRM(allocTotal)}</b></span>
            <span className={remaining.lt(0) ? "text-red-600" : ""}>Remaining: <b>{fmtRM(remaining)}</b></span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          disabled={pending || !residentId || !amount || !receiptNo.trim() || remaining.lt(0)}
          onClick={() => start(async () => {
            try {
              const allocations = Object.entries(allocs)
                .filter(([, v]) => new Decimal(v || 0).gt(0))
                .map(([chargeId, v]) => ({ chargeId, amount: v }));
              const input = {
                residentId, date, amount, method, bankRef: bankRef || undefined, allocations,
                receiptNo, receivedFrom: receivedFrom || undefined,
                periodFrom: periodFrom || undefined, periodTo: periodTo || undefined,
                chequeNo: chequeNo || undefined,
              };
              if (draftId) {
                await unwrap(updateDraft(draftId, { kind: "receipt", input }));
                toast.success(`Draft ${receiptNo} updated`);
                router.push(`/drafts/${draftId}`);
                return;
              }
              const r = await unwrap(createReceipt(input));
              if (r.draft) {
                toast.success(`Receipt ${r.receiptNo} saved as a draft — check it and post it from Drafts`);
                router.push(`/drafts/${r.id}`);
              } else {
                toast.success(`Receipt ${r.receiptNo} created`);
                router.push(`/receipts/${r.id}?print=1`);
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          })}
        >{pending ? "Saving…" : draftId ? "Save changes" : "Save receipt"}</Button>
      </div>
    </div>
  );
}
