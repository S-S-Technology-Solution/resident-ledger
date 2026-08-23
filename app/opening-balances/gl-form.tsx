"use client";

import { useMemo, useState, useTransition } from "react";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataCard } from "@/components/data-card";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { saveGLOpeningBalances } from "./actions";

type Row = {
  accountId: string;
  code: string;
  name: string;
  group: string;
  normalSide: "DEBIT" | "CREDIT";
  debit: string;
  credit: string;
};

export function GLOpeningForm({ initial, openingDate }: { initial: Row[]; openingDate: string }) {
  const [rows, setRows] = useState(initial);
  const [date, setDate] = useState(openingDate);
  const [pending, start] = useTransition();

  const totals = useMemo(() => {
    const dr = rows.reduce((s, r) => s.plus(new Decimal(r.debit || 0)), new Decimal(0));
    const cr = rows.reduce((s, r) => s.plus(new Decimal(r.credit || 0)), new Decimal(0));
    return { dr, cr, diff: dr.minus(cr), balanced: dr.equals(cr) };
  }, [rows]);

  function set(accountId: string, field: "debit" | "credit", value: string) {
    if (value && !/^\d*\.?\d{0,2}$/.test(value)) return;
    setRows((rs) => rs.map((r) => (
      r.accountId === accountId
        // Typing in one column clears the other — an account has one side, not both.
        ? { ...r, [field]: value, [field === "debit" ? "credit" : "debit"]: "0.00" }
        : r
    )));
  }

  function submit() {
    start(async () => {
      try {
        const res = await saveGLOpeningBalances({
          date,
          rows: rows.map((r) => ({
            accountId: r.accountId,
            debit: r.debit || "0",
            credit: r.credit || "0",
          })),
        });
        toast.success(`Opening balances saved — ${res.lines} accounts, ${fmtRM(res.totalDr)} each side`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="opening-date">Cut-over date</Label>
          <Input
            id="opening-date"
            type="date"
            className="w-44"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          The closing date of the previous system. Brought-forward balances are dated here.
        </p>
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Group</TableHead>
              <TableHead className="w-36 text-right">Debit</TableHead>
              <TableHead className="w-36 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.accountId}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.group}</TableCell>
                <TableCell className="text-right">
                  <Input
                    inputMode="decimal"
                    className="ml-auto w-32 text-right font-mono"
                    value={r.debit}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => set(r.accountId, "debit", e.target.value)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    inputMode="decimal"
                    className="ml-auto w-32 text-right font-mono"
                    value={r.credit}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => set(r.accountId, "credit", e.target.value)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
        <div className="flex gap-6 text-sm">
          <span>
            Total debit <span className="ml-2 font-mono font-semibold">{fmtRM(totals.dr)}</span>
          </span>
          <span>
            Total credit <span className="ml-2 font-mono font-semibold">{fmtRM(totals.cr)}</span>
          </span>
          {!totals.balanced && (
            <span className="text-rose-600">
              Out by <span className="ml-2 font-mono font-semibold">{fmtRM(totals.diff.abs())}</span>
            </span>
          )}
        </div>
        <Button disabled={pending || !totals.balanced || totals.dr.isZero()} onClick={submit}>
          {pending ? "Saving…" : "Save opening balances"}
        </Button>
      </div>
    </div>
  );
}
