"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { bulkGenerate } from "./actions";

export function BulkGenerateButton() {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Bulk generate</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Bulk generate monthly charges</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">
          For every active resident with a monthly fee &gt; 0, creates a charge for the selected period.
          Skips residents who already have a non-voided charge for that period.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Month</Label>
            <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(parseInt(e.target.value || "1", 10))} />
          </div>
          <div className="space-y-1">
            <Label>Year</Label>
            <Input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(parseInt(e.target.value || "2025", 10))} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() => start(async () => {
              try {
                const { created, skipped } = await bulkGenerate({ periodMonth: month, periodYear: year, date });
                toast.success(`Created ${created}, skipped ${skipped}`);
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            })}
          >{pending ? "Generating…" : "Generate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
