"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtRM } from "@/lib/money";

export function StatementBalance({ bookBalanceCleared }: { bookBalanceCleared: number }) {
  const [stmt, setStmt] = useState("");
  const stmtNum = parseFloat(stmt);
  const valid = !isNaN(stmtNum);
  const diff = valid ? bookBalanceCleared - stmtNum : null;
  const matches = diff !== null && Math.abs(diff) < 0.005;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="space-y-1">
          <Label>Statement closing balance (RM)</Label>
          <Input
            inputMode="decimal"
            value={stmt}
            onChange={(e) => setStmt(e.target.value)}
            placeholder="e.g. 12,345.67"
            className="w-48 text-right font-mono tabular"
          />
        </div>
        <div className="text-sm space-y-0.5">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Book (cleared)</div>
          <div className="font-mono tabular text-base">{fmtRM(bookBalanceCleared)}</div>
        </div>
        {valid && (
          <div className="text-sm space-y-0.5">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Difference</div>
            <div className={`font-mono tabular text-base ${matches ? "text-emerald-700" : "text-rose-700"}`}>
              {fmtRM(diff!)}
            </div>
          </div>
        )}
        {valid && (
          <div className={`rounded-md px-3 py-1.5 text-xs font-medium ${matches ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {matches ? "✓ Reconciled" : "Not reconciled"}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Enter the closing balance from your bank statement to check if your cleared transactions match.
      </p>
    </div>
  );
}
