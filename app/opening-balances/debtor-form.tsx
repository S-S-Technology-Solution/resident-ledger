"use client";

import { useMemo, useState, useTransition } from "react";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataCard } from "@/components/data-card";
import { toast } from "sonner";
import { fmtRM } from "@/lib/money";
import { saveDebtorOpeningBalances, saveCreditorOpeningBalances } from "./actions";

type Row = {
  id: string;
  code: string | null;
  primary: string;
  secondary: string;
  amount: string;
};

/**
 * Shared grid for debtor and creditor brought-forward balances. Debtors may be
 * negative (in credit at cut-over); creditors may not.
 */
export function SubsidiaryOpeningForm({
  kind,
  initial,
  controlAmount,
}: {
  kind: "debtor" | "creditor";
  initial: Row[];
  controlAmount: string;
}) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const allowNegative = kind === "debtor";

  const total = useMemo(
    () => rows.reduce((s, r) => s.plus(new Decimal(r.amount || 0)), new Decimal(0)),
    [rows],
  );
  const control = new Decimal(controlAmount || 0);
  const difference = control.minus(total);
  const agrees = difference.isZero();

  const visible = q
    ? rows.filter((r) =>
        [r.code, r.primary, r.secondary].some((v) => v?.toLowerCase().includes(q.toLowerCase())),
      )
    : rows;

  function set(id: string, value: string) {
    const pattern = allowNegative ? /^-?\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,2}$/;
    if (value && !pattern.test(value)) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, amount: value } : r)));
  }

  function submit() {
    start(async () => {
      try {
        if (kind === "debtor") {
          const res = await saveDebtorOpeningBalances({
            rows: rows.map((r) => ({ residentId: r.id, amount: r.amount || "0" })),
          });
          toast.success(
            `Saved — ${res.owing} owing, ${res.advance} in advance, ${res.cleared} with nothing brought forward`,
          );
        } else {
          const res = await saveCreditorOpeningBalances({
            rows: rows.map((r) => ({ supplierId: r.id, amount: r.amount || "0" })),
          });
          toast.success(`Saved — ${res.saved} with a balance, ${res.cleared} cleared`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Input
        className="max-w-sm"
        placeholder={kind === "debtor" ? "Search unit, owner or code…" : "Search supplier…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{kind === "debtor" ? "Debtor A/C" : "Creditor A/C"}</TableHead>
              <TableHead>{kind === "debtor" ? "Unit" : "Supplier"}</TableHead>
              {kind === "debtor" && <TableHead>Owner</TableHead>}
              <TableHead className="w-40 text-right">Balance b/f</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-muted-foreground">{r.code ?? "—"}</TableCell>
                <TableCell className="font-medium">{r.primary}</TableCell>
                {kind === "debtor" && (
                  <TableCell className="text-muted-foreground">{r.secondary}</TableCell>
                )}
                <TableCell className="text-right">
                  <Input
                    inputMode="decimal"
                    className="ml-auto w-32 text-right font-mono"
                    value={r.amount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => set(r.id, e.target.value)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
        <div className="space-y-1 text-sm">
          <div className="flex gap-6">
            <span>
              Keyed here <span className="ml-2 font-mono font-semibold">{fmtRM(total)}</span>
            </span>
            <span className="text-muted-foreground">
              Control account <span className="ml-2 font-mono">{fmtRM(control)}</span>
            </span>
          </div>
          {control.isZero() ? (
            <p className="text-xs text-muted-foreground">
              No control figure yet — key the GL opening balances first, then these must match it.
            </p>
          ) : agrees ? (
            <p className="text-xs text-emerald-600">Agrees with the control account.</p>
          ) : (
            <p className="text-xs text-rose-600">
              Out by {fmtRM(difference.abs())} against the control account — these must agree before the
              opening balances are complete.
            </p>
          )}
        </div>
        <Button disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Save brought-forward balances"}
        </Button>
      </div>
    </div>
  );
}
