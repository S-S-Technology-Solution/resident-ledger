"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createEntry } from "./actions";

type Account = { id: string; code: string; name: string; type: string };

export function CashEntryDialog({
  direction,
  accounts,
}: {
  direction: "IN" | "OUT";
  accounts: Account[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [method, setMethod] = useState<"BANK" | "CASH">("BANK");
  const [bankRef, setBankRef] = useState("");
  const [chequeNo, setChequeNo] = useState("");

  const isIn = direction === "IN";
  // Money in lands on an income account, money out on an expense account.
  const relevant = accounts.filter((a) => (isIn ? a.type === "INCOME" : a.type === "EXPENSE"));

  function reset() {
    setAmount(""); setDescription(""); setAccountId("");
    setCounterparty(""); setBankRef(""); setChequeNo("");
  }

  function submit() {
    start(async () => {
      try {
        const res = await createEntry({
          direction, date, amount, description, accountId,
          counterparty: counterparty || undefined,
          method,
          bankRef: bankRef || undefined,
          chequeNo: chequeNo || undefined,
        });
        toast.success(`${isIn ? "Receipt" : "Payment voucher"} ${res.refNo} saved`);
        setOpen(false);
        reset();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant={isIn ? "default" : "outline"}>
          {isIn ? "New receipt" : "New payment"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isIn ? "Cash book receipt" : "Payment voucher"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {isIn
              ? "Money received that is not from a resident — bank interest, a donation, a refund."
              : "Money paid out without a supplier bill behind it — a sundry or one-off payment."}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Amount (RM)</Label>
              <Input
                inputMode="decimal"
                className="text-right font-mono"
                value={amount}
                onChange={(e) => {
                  if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value);
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{isIn ? "Income account" : "Expense account"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
              <SelectContent>
                {relevant.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIn ? "e.g. Bank interest for June" : "e.g. Refreshments for AGM"}
            />
          </div>

          <div className="space-y-1">
            <Label>{isIn ? "Received from" : "Paid to"} (optional)</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "BANK" | "CASH")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Bank ref</Label>
              <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Cheque no.</Label>
              <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !amount || !description || !accountId} onClick={submit}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
