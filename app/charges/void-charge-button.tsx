"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { voidCharge } from "./actions";

export function VoidChargeButton({ id, size = "sm" }: { id: string; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline">Void</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Void charge</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          A reversing journal entry will be created and the charge marked voided.
          Charges with payments allocated must have their receipt(s) voided first.
        </p>
        <div className="space-y-1">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amount, duplicate" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending || !reason}
            onClick={() => start(async () => {
              try {
                await voidCharge(id, reason);
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
