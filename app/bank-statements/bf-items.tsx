"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRM } from "@/lib/money";
import { removeBfItem, saveBfItem } from "./actions";

export type BfRow = {
  id: string; date: string; direction: "IN" | "OUT"; amount: number; chequeNo: string | null; description: string;
  clearedBy: { ref: string; date: string; statementId: string | null } | null;
};

/**
 * Cheques issued and deposits banked before the cut-over that the bank had not
 * yet put through. The opening balance already holds them, so they post
 * nothing; listing them lets the statement line that clears them be matched.
 */
export function BfItems({ rows, canEdit, cutover }: { rows: BfRow[]; canEdit: boolean; cutover: string }) {
  const [editing, setEditing] = useState<BfRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const out = rows.filter((r) => !r.clearedBy);
  const total = (d: "IN" | "OUT") => out.filter((r) => r.direction === d).reduce((s, r) => s + r.amount, 0);

  return (
    <div id="brought-forward" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Brought forward — outstanding at the cut-over ({cutover})</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Cheques issued or deposits banked before the cut-over that had not gone through the bank by then.
            They are already in the opening balance, so nothing is posted — each stays outstanding on the
            reconciliation until you match it with the statement line that clears it.
          </p>
        </div>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing("new")}>Add item</Button>}
      </div>
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-28">Cheque no.</TableHead>
              <TableHead>To / from</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-44">Cleared</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.direction === "OUT" ? "Cheque out" : "Deposit in"}</TableCell>
                <TableCell className="font-mono text-xs">{r.chequeNo}</TableCell>
                <TableCell className="whitespace-normal">{r.description}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.amount)}</TableCell>
                <TableCell className="text-sm">
                  {r.clearedBy
                    ? r.clearedBy.statementId
                      ? <Link className="underline font-mono text-xs" href={`/bank-statements/${r.clearedBy.statementId}`}>{r.clearedBy.ref}</Link>
                      : <span className="font-mono text-xs">{r.clearedBy.ref}</span>
                    : <span className="text-amber-700">Outstanding</span>}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && !r.clearedBy && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
                        if (!confirm("Remove this brought-forward item?")) return;
                        start(async () => {
                          const res = await removeBfItem(r.id);
                          if (res.ok) toast.success("Removed"); else toast.error(res.error);
                        });
                      }}>Remove</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {rows.length === 0
          ? "None entered."
          : `Still outstanding: cheques RM ${fmtRM(total("OUT"))} · deposits RM ${fmtRM(total("IN"))}`}
      </p>
      {editing && <BfDialog row={editing === "new" ? null : editing} cutover={cutover} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BfDialog({ row, cutover, onClose }: { row: BfRow | null; cutover: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    date: row?.date ?? cutover,
    direction: row?.direction ?? ("OUT" as "IN" | "OUT"),
    amount: row ? row.amount.toFixed(2) : "",
    chequeNo: row?.chequeNo ?? "",
    description: row?.description ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Edit" : "Add"} brought-forward item</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bf-dir">Type</Label>
            <select id="bf-dir" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.direction} onChange={set("direction")}>
              <option value="OUT">Cheque issued, not yet presented</option>
              <option value="IN">Deposit banked, not yet credited</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bf-date">Date issued / banked</Label>
            <Input id="bf-date" type="date" value={f.date} onChange={set("date")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bf-chq">Cheque no.</Label>
            <Input id="bf-chq" value={f.chequeNo} onChange={set("chequeNo")} placeholder="e.g. 938" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bf-amt">Amount (RM)</Label>
            <Input id="bf-amt" inputMode="decimal" value={f.amount} onChange={set("amount")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="bf-desc">Paid to / received from</Label>
            <Input id="bf-desc" value={f.description} onChange={set("description")} placeholder="e.g. BF Valiant — Dec 2025 guards" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={() => start(async () => {
            const res = await saveBfItem(row?.id ?? null, f);
            if (res.ok) { toast.success("Saved"); onClose(); } else toast.error(res.error);
          })}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
