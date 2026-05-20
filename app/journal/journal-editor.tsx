"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { fmtRM } from "@/lib/money";
import { saveDraft, postEntry } from "./actions";

type AccountOpt = { id: string; code: string; name: string };

type Line = { accountId: string; debit: string; credit: string; memo: string };

const emptyLine = (): Line => ({ accountId: "", debit: "", credit: "", memo: "" });

export function JournalEditor({
  accounts,
  initial,
}: {
  accounts: AccountOpt[];
  initial?: {
    id: string;
    entryNo: string;
    date: string;
    description: string;
    reference: string | null;
    status: "DRAFT" | "POSTED" | "VOIDED";
    lines: Line[];
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [emptyLine(), emptyLine()]);
  const readOnly = initial?.status && initial.status !== "DRAFT";

  const totals = useMemo(() => {
    const d = lines.reduce((a, l) => a.plus(new Decimal(l.debit || 0)), new Decimal(0));
    const c = lines.reduce((a, l) => a.plus(new Decimal(l.credit || 0)), new Decimal(0));
    return { d, c, diff: d.minus(c), balanced: d.equals(c) && d.gt(0) };
  }, [lines]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function doSave(thenPost = false) {
    start(async () => {
      try {
        const { id } = await saveDraft({
          id: initial?.id,
          date,
          description,
          reference: reference || undefined,
          lines: lines.map((l) => ({ accountId: l.accountId, debit: l.debit || "0", credit: l.credit || "0", memo: l.memo || undefined })),
        });
        if (thenPost) {
          await postEntry(id);
          toast.success("Entry posted");
        } else {
          toast.success("Draft saved");
        }
        router.push(`/journal/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} disabled={!!readOnly} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Description</Label>
          <Input value={description} disabled={!!readOnly} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Reference (optional)</Label>
          <Input value={reference} disabled={!!readOnly} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Account</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="w-32 text-right">Debit</TableHead>
              <TableHead className="w-32 text-right">Credit</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Combobox
                    disabled={!!readOnly}
                    value={l.accountId}
                    onChange={(v) => updateLine(i, { accountId: v })}
                    placeholder="Select account…"
                    options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.code }))}
                  />
                </TableCell>
                <TableCell>
                  <Input value={l.memo} disabled={!!readOnly} onChange={(e) => updateLine(i, { memo: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    className="text-right font-mono"
                    value={l.debit}
                    disabled={!!readOnly}
                    onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    className="text-right font-mono"
                    value={l.credit}
                    disabled={!!readOnly}
                    onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                  />
                </TableCell>
                <TableCell>
                  {!readOnly && lines.length > 2 && (
                    <Button size="sm" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          {!readOnly && <Button variant="outline" size="sm" onClick={addLine}>+ Add line</Button>}
          <div className="ml-auto flex gap-6 font-mono">
            <span>Debit: <b>{fmtRM(totals.d)}</b></span>
            <span>Credit: <b>{fmtRM(totals.c)}</b></span>
            <span className={totals.balanced ? "text-emerald-600" : "text-red-600"}>
              {totals.balanced ? "Balanced ✓" : `Diff ${fmtRM(totals.diff.abs())}`}
            </span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => doSave(false)}>Save draft</Button>
          <Button disabled={pending || !totals.balanced || !description} onClick={() => doSave(true)}>
            Save & Post
          </Button>
        </div>
      )}
    </div>
  );
}
