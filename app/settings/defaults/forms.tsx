"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataCard } from "@/components/data-card";
import { toast } from "sonner";
import { saveControlAccounts, saveSequences } from "./actions";

type Account = { code: string; name: string };
type ControlRow = { key: string; label: string; description: string; code: string };

export function ControlAccountsForm({
  rows,
  accounts,
  readOnly,
}: {
  rows: ControlRow[];
  accounts: Account[];
  readOnly: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.key, r.code])),
  );
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      try {
        await saveControlAccounts(values as Parameters<typeof saveControlAccounts>[0]);
        toast.success("Control accounts saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="space-y-1">
            <Label>{r.label}</Label>
            <Select
              value={values[r.key]}
              onValueChange={(v) => setValues((s) => ({ ...s, [r.key]: v }))}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{r.description}</p>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Save control accounts"}
          </Button>
        </div>
      )}
    </div>
  );
}

type SeqRow = {
  key: string;
  label: string;
  prefix: string;
  padding: number;
  resetMonthly: boolean;
  isDefault: boolean;
};

function preview(prefix: string, padding: number, resetMonthly: boolean) {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const stem = resetMonthly ? `${prefix}${yy}${mm}` : `${prefix}${now.getFullYear()}-`;
  return `${stem}${"1".padStart(padding, "0")}`;
}

export function SequenceForm({ rows: initial, readOnly }: { rows: SeqRow[]; readOnly: boolean }) {
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();

  function update(key: string, patch: Partial<SeqRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    start(async () => {
      try {
        await saveSequences({
          rows: rows.map((r) => ({
            key: r.key, prefix: r.prefix, padding: r.padding, resetMonthly: r.resetMonthly,
          })),
        });
        toast.success("Numbering saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="w-32">Prefix</TableHead>
              <TableHead className="w-24">Digits</TableHead>
              <TableHead className="w-40">Restarts</TableHead>
              <TableHead className="w-44">Next looks like</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell>
                  <Input
                    className="w-24 font-mono"
                    value={r.prefix}
                    disabled={readOnly}
                    onChange={(e) => update(r.key, { prefix: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="w-16 text-right font-mono"
                    value={String(r.padding)}
                    disabled={readOnly}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      if (n >= 1 && n <= 8) update(r.key, { padding: n });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.resetMonthly ? "monthly" : "yearly"}
                    onValueChange={(v) => update(r.key, { resetMonthly: v === "monthly" })}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Every month</SelectItem>
                      <SelectItem value="yearly">Every year</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {preview(r.prefix, r.padding, r.resetMonthly)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Changing a prefix or width only affects numbers issued from now on — documents already
        issued keep the number they were given.
      </p>

      {!readOnly && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Save numbering"}
          </Button>
        </div>
      )}
    </div>
  );
}
