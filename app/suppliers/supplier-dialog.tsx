"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { upsertSupplier } from "./actions";

type Supplier = { id: string; name: string; creditorCode?: string; contact?: string; phone?: string; bankAccount?: string };

export function SupplierDialog({ mode, supplier }: { mode: "create" | "edit"; supplier?: Supplier }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(supplier?.name ?? "");
  const [creditorCode, setCreditorCode] = useState(supplier?.creditorCode ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [bankAccount, setBank] = useState(supplier?.bankAccount ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? <Button>New Supplier</Button> : <Button size="sm" variant="outline">Edit</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "New supplier" : "Edit supplier"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Company name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Creditor A/C</Label><Input value={creditorCode} onChange={(e) => setCreditorCode(e.target.value)} placeholder="e.g. 4000/001" /></div>
          <div className="space-y-1"><Label>Contact person</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1"><Label>Bank account</Label><Input value={bankAccount} onChange={(e) => setBank(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !name}
            onClick={() => start(async () => {
              try {
                await upsertSupplier({ id: supplier?.id, name, creditorCode, contact, phone, bankAccount });
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
