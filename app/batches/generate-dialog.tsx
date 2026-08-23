"use client";

import { useState, useTransition } from "react";
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
import { generate, setBatchLocked, deleteBatch } from "./actions";

const GROUPS = [
  { key: "SALES", label: "Sales" },
  { key: "PURCHASE", label: "Purchases" },
  { key: "BANK", label: "Bank" },
  { key: "JOURNAL", label: "Journal vouchers" },
  { key: "WAGES", label: "Wages" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Group = (typeof GROUPS)[number]["key"];

export function GenerateBatchDialog({ defaultYear }: { defaultYear: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [groups, setGroups] = useState<Group[]>(GROUPS.map((g) => g.key));
  const [fromMonth, setFromMonth] = useState("1");
  const [fromYear, setFromYear] = useState(String(defaultYear));
  const [toMonth, setToMonth] = useState("12");
  const [toYear, setToYear] = useState(String(defaultYear));

  function toggle(g: Group) {
    setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));
  }

  function submit() {
    start(async () => {
      try {
        const res = await generate({
          groups,
          fromYear: Number(fromYear), fromMonth: Number(fromMonth),
          toYear: Number(toYear), toMonth: Number(toMonth),
        });
        toast.success(
          res.created === 0
            ? "Those batches already exist"
            : `${res.created} ${res.created === 1 ? "batch" : "batches"} generated`,
        );
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not generate");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Generate batches</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate batches</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Batch groups</Label>
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggle(g.key)}
                  className={
                    groups.includes(g.key)
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                      : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                  }
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>From</Label>
              <div className="flex gap-2">
                <Select value={fromMonth} onValueChange={setFromMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-24"
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <div className="flex gap-2">
                <Select value={toMonth} onValueChange={setToMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-24"
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Batches are also created automatically the first time something is posted into a month,
            so this is only needed if you want them laid out in advance.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || groups.length === 0} onClick={submit}>
            {pending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LockBatchButton({ id, locked }: { id: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setBatchLocked(id, !locked);
            toast.success(locked ? "Batch unlocked" : "Batch locked");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        })
      }
    >
      {locked ? "Unlock" : "Lock"}
    </Button>
  );
}

export function DeleteBatchButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await deleteBatch(id);
            toast.success("Batch deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        })
      }
    >
      Delete
    </Button>
  );
}
