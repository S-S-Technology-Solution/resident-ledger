"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataCard } from "@/components/data-card";
import { toast } from "sonner";
import { importCsv, type ImportKind, type ImportResult } from "./actions";

const KINDS: { key: ImportKind; label: string; columns: string; note: string }[] = [
  {
    key: "residents",
    label: "Residents",
    columns: "unit, owner, debtorCode, phone, monthlyFee",
    note: "Matched on unit address — an existing unit is updated, a new one is created.",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    columns: "name, creditorCode, contact, phone, bankAccount",
    note: "Matched on supplier name.",
  },
  {
    key: "debtorOpening",
    label: "Debtor opening balances",
    columns: "unit or debtorCode, amount",
    note: "Replaces the brought-forward figure for each resident. Negative means they were in credit.",
  },
  {
    key: "accounts",
    label: "Chart of accounts",
    columns: "code, name, type, group, classifiedAs",
    note: "Type must be ASSET, LIABILITY, EQUITY, INCOME or EXPENSE. Existing codes are updated.",
  },
];

export function ImportForm({ readOnly }: { readOnly: boolean }) {
  const [kind, setKind] = useState<ImportKind>("residents");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const spec = KINDS.find((k) => k.key === kind)!;

  function run(apply: boolean) {
    start(async () => {
      try {
        const res = await importCsv(kind, text, apply);
        setResult(res);
        if (apply) toast.success(`Imported ${res.ok} row${res.ok === 1 ? "" : "s"}`);
        else toast.success(`Checked ${res.rows.length} row${res.rows.length === 1 ? "" : "s"} — nothing saved yet`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>What are you importing?</Label>
          <Select
            value={kind}
            onValueChange={(v) => { setKind(v as ImportKind); setResult(null); }}
            disabled={readOnly}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="csv-file">CSV file</Label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            disabled={readOnly}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setText(await file.text());
              setResult(null);
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <div>
          <span className="font-medium">Columns:</span>{" "}
          <span className="font-mono text-xs">{spec.columns}</span>
        </div>
        <p className="mt-1 text-muted-foreground">{spec.note}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The first row must be a header. Column names are matched loosely, so
          &ldquo;Unit Address&rdquo; and &ldquo;unit&rdquo; both work.
        </p>
      </div>

      {text && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {fileName} loaded ({text.split("\n").length - 1} lines)
          </span>
          <Button variant="outline" disabled={pending || readOnly} onClick={() => run(false)}>
            {pending ? "Checking…" : "Check file"}
          </Button>
          <Button
            disabled={pending || readOnly || !result || result.applied || result.ok === 0}
            onClick={() => run(true)}
          >
            {pending ? "Importing…" : `Import ${result?.ok ?? 0} rows`}
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex gap-3 text-sm">
            <Badge>{result.ok} ready</Badge>
            {result.problems > 0 && (
              <Badge variant="outline" className="border-rose-300 text-rose-600">
                {result.problems} skipped
              </Badge>
            )}
            {result.applied && <Badge variant="outline">Imported</Badge>}
          </div>

          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Line</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead className="w-32">Action</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.slice(0, 300).map((r) => (
                  <TableRow key={r.line} className={r.problem ? "text-rose-600" : ""}>
                    <TableCell className="font-mono text-muted-foreground">{r.line}</TableCell>
                    <TableCell>{r.summary}</TableCell>
                    <TableCell>{r.action}</TableCell>
                    <TableCell>{r.problem ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {result.rows.length > 300 && (
              <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                Showing the first 300 of {result.rows.length} rows.
              </div>
            )}
          </DataCard>
        </div>
      )}
    </div>
  );
}
