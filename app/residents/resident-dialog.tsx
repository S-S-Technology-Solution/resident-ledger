"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { upsertResident } from "./actions";

type Resident = { id: string; unitAddress: string; ownerName: string; phone?: string; monthlyFee: string };

export function ResidentDialog({ mode, resident }: { mode: "create" | "edit"; resident?: Resident }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [unitAddress, setUnit] = useState(resident?.unitAddress ?? "");
  const [ownerName, setOwner] = useState(resident?.ownerName ?? "");
  const [phone, setPhone] = useState(resident?.phone ?? "");
  const [monthlyFee, setFee] = useState(resident?.monthlyFee ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? <Button>New Resident</Button> : <Button size="sm" variant="outline">Edit</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "New resident" : "Edit resident"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Unit address</Label>
            <Input value={unitAddress} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. No 12A, Jln 1/4" />
          </div>
          <div className="space-y-1">
            <Label>Owner name</Label>
            <Input value={ownerName} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Monthly fee (RM)</Label>
            <Input inputMode="decimal" value={monthlyFee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 60.00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !unitAddress || !ownerName}
            onClick={() => start(async () => {
              try {
                await upsertResident({
                  id: resident?.id,
                  unitAddress, ownerName,
                  phone: phone || undefined,
                  monthlyFee: monthlyFee || "0",
                });
                toast.success("Saved");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}
          >{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
