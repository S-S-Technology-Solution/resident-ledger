"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { previewClosing, runYearEndClosing, undoYearEndClosing } from "./actions";

type Preview = Awaited<ReturnType<typeof previewClosing>>;

export function CloseYearDialog({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function load(next: boolean) {
    setOpen(next);
    if (!next) { setPreview(null); setConfirm(""); return; }
    start(async () => {
      try {
        setPreview(await previewClosing(year));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not read the year");
        setOpen(false);
      }
    });
  }

  function submit() {
    start(async () => {
      try {
        const res = await runYearEndClosing(year);
        toast.success(`${year} closed — ${res.entryNo}, surplus ${fmtRM(res.surplus)}`);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Closing failed");
      }
    });
  }

  const blocked = (preview?.draftCount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        <Button size="sm">Close year</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Close financial year {year}</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <p className="py-6 text-sm text-muted-foreground">Working out the year&rsquo;s result…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Result for {year}</TableHead>
                    <TableHead className="text-right w-40">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Total income</TableCell>
                    <TableCell className="text-right font-mono">{fmtRM(preview.totalIncome)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total expenditure</TableCell>
                    <TableCell className="text-right font-mono">{fmtRM(preview.totalExpense)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">
                      {preview.isDeficit ? "Deficit for the year" : "Surplus for the year"}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${preview.isDeficit ? "text-rose-600" : ""}`}>
                      {fmtRM(preview.surplus)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <p className="text-sm text-muted-foreground">
              This zeroes {preview.income.length + preview.expense.length} income and expenditure
              accounts into 1000/0000 Accumulated Fund, then locks {year} so nothing further can be
              posted into it. It can be undone.
            </p>

            {blocked && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {preview.draftCount} unposted draft {preview.draftCount === 1 ? "entry" : "entries"} still
                sit in {year}. Post or delete them first.
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="confirm-year">Type <span className="font-mono">{year}</span> to confirm</Label>
              <Input
                id="confirm-year"
                className="w-40"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={String(year)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => load(false)}>Cancel</Button>
          <Button
            disabled={pending || blocked || confirm !== String(year)}
            onClick={submit}
          >
            {pending ? "Closing…" : `Close ${year}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenYearButton({ year }: { year: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await undoYearEndClosing(year);
            toast.success(`${year} reopened`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not reopen");
          }
        })
      }
    >
      {pending ? "Reopening…" : "Reopen"}
    </Button>
  );
}
