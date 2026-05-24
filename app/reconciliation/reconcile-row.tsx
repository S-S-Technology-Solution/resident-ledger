"use client";

import { ReactNode, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { setReceiptCleared, setPaymentCleared, updateReceiptStatementRef, updatePaymentStatementRef } from "./actions";
import { fmtRM } from "@/lib/money";

export function ReconcileRow({
  kind, id, cleared: initialCleared, date, code, label, bankRef, statementRef: initialRef, amount, amountTone,
}: {
  kind: "receipt" | "payment";
  id: string;
  cleared: boolean;
  date: string;
  code: ReactNode;
  label: string;
  bankRef: string;
  statementRef: string;
  amount: number;
  amountTone: "positive" | "negative";
}) {
  const [cleared, setCleared] = useState(initialCleared);
  const [ref, setRef] = useState(initialRef);
  const [, start] = useTransition();

  function toggle() {
    const next = !cleared;
    setCleared(next);
    start(async () => {
      try {
        if (kind === "receipt") await setReceiptCleared(id, next, ref);
        else await setPaymentCleared(id, next, ref);
      } catch (e) {
        setCleared(!next);
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function commitRef() {
    if (ref === initialRef) return;
    start(async () => {
      try {
        if (kind === "receipt") await updateReceiptStatementRef(id, ref);
        else await updatePaymentStatementRef(id, ref);
        toast.success("Statement reference saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const amountCls = amountTone === "positive" ? "text-emerald-700" : "text-rose-700";
  const rowCls = cleared ? "bg-emerald-50/40" : "";

  return (
    <TableRow className={rowCls}>
      <TableCell>
        <input
          type="checkbox"
          className="h-4 w-4 accent-emerald-600 cursor-pointer"
          checked={cleared}
          onChange={toggle}
        />
      </TableCell>
      <TableCell className="text-sm">{date}</TableCell>
      <TableCell className="font-mono text-xs">{code}</TableCell>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono">{bankRef || "—"}</TableCell>
      <TableCell>
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onBlur={commitRef}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Stmt ref…"
          className="h-8 text-xs"
        />
      </TableCell>
      <TableCell className={`text-right font-mono tabular ${amountCls}`}>{fmtRM(amount)}</TableCell>
    </TableRow>
  );
}
