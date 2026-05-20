"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { voidReceipt } from "../actions";

export function VoidReceiptButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="destructive">Void</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Void receipt</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">A reversing journal entry will be created and the receipt marked voided.</p>
        <div className="space-y-1">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending || !reason}
            onClick={() => start(async () => {
              try {
                await voidReceipt(id, reason);
                toast.success("Voided");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}
          >Void</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
