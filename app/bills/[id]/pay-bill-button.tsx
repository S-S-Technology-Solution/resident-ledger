"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { payBill } from "../actions";

export function PayBillButton({ billId, open }: { billId: string; open: string }) {
  const [openDlg, setOpenDlg] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(open);
  const [method, setMethod] = useState<"CASH" | "BANK">("BANK");
  const [bankRef, setBankRef] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog open={openDlg} onOpenChange={setOpenDlg}>
      <DialogTrigger asChild><Button>Pay</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Amount (RM)</Label><Input inputMode="decimal" className="text-right font-mono tabular" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
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
            <Label>Bank reference (optional)</Label>
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenDlg(false)}>Cancel</Button>
          <Button
            disabled={pending || !amount}
            onClick={() => start(async () => {
              try {
                await payBill({ billId, date, amount, method, bankRef: bankRef || undefined });
                toast.success("Payment recorded");
                setOpenDlg(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}
          >{pending ? "Saving…" : "Pay"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
