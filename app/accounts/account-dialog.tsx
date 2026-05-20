"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { upsertAccount } from "./actions";

type Account = {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  normalSide: "DEBIT" | "CREDIT";
};

const TYPE_TO_NORMAL: Record<Account["type"], Account["normalSide"]> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
};

export function AccountDialog({ mode, account }: { mode: "create" | "edit"; account?: Account }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "EXPENSE");
  const normalSide = account?.normalSide ?? TYPE_TO_NORMAL[type];

  function submit() {
    start(async () => {
      try {
        await upsertAccount({ id: account?.id, code, name, type, normalSide: TYPE_TO_NORMAL[type] });
        toast.success(mode === "create" ? "Account created" : "Account updated");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>New Account</Button>
        ) : (
          <Button size="sm" variant="outline">Edit</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New account" : "Edit account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 5040" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as Account["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASSET">Asset</SelectItem>
                  <SelectItem value="LIABILITY">Liability</SelectItem>
                  <SelectItem value="EQUITY">Equity</SelectItem>
                  <SelectItem value="INCOME">Income</SelectItem>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upkeep & Maintenance" />
          </div>
          <p className="text-xs text-slate-500">Normal balance: <span className="font-mono">{normalSide}</span> (auto-set by type)</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !code || !name} onClick={submit}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
