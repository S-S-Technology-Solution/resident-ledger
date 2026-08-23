"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { returnCheque } from "../actions";

export function ChequeReturnButton({ id, receiptNo }: { id: string; receiptNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [bankCharge, setBankCharge] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Cheque returned</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cheque returned — {receiptNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reverses this receipt so the invoices it settled fall open again. The resident&rsquo;s
            balance goes back up and the ledger shows why.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cr-date">Date returned</Label>
              <Input id="cr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-charge">Bank charge (optional)</Label>
              <Input
                id="cr-charge"
                inputMode="decimal"
                className="text-right font-mono"
                placeholder="0.00"
                value={bankCharge}
                onChange={(e) => {
                  if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) setBankCharge(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cr-reason">Reason</Label>
            <Input
              id="cr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Insufficient funds"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            A bank charge is posted separately against 90B1 Bank charges — it is a cost to the
            association, not part of the reversal.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !reason.trim()}
            onClick={() =>
              start(async () => {
                try {
                  await returnCheque({ receiptId: id, date, reason, bankCharge: bankCharge || undefined });
                  toast.success(`${receiptNo} reversed as a returned cheque`);
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              })
            }
          >
            {pending ? "Processing…" : "Record return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
