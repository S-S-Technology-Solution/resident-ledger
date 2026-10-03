"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { unwrap } from "@/lib/action";
import { addSupplierDebitNote } from "../actions";

/** Our debit note to the supplier — reduces what we owe on this bill without paying. */
export function DebitNoteButton({ billId, open: owing }: { billId: string; open: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Debit note</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Debit note to supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reduces what we owe on this bill — e.g. a short delivery or an overcharge the supplier has agreed. RM {fmtRM(owing)} is still owing.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="sdn-date">Date</Label><Input id="sdn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1">
              <Label htmlFor="sdn-amt">Amount (RM)</Label>
              <Input id="sdn-amt" inputMode="decimal" className="text-right font-mono" value={amount}
                onChange={(e) => { if (!e.target.value || /^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value); }} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sdn-desc">Reason</Label>
            <Input id="sdn-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 2 guard shifts not provided in August" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !amount || !description.trim()} onClick={() => start(async () => {
            try {
              const res = await unwrap(addSupplierDebitNote({ billId, date, amount, description }));
              toast.success(`Debit note ${res.noteNo} saved`);
              setOpen(false);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save");
            }
          })}>{pending ? "Saving…" : "Save debit note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
