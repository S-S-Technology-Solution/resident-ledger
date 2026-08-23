import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Landmark } from "lucide-react";
import Link from "next/link";
import { ReconcileRow } from "./reconcile-row";
import { StatementBalance } from "./statement-balance";

export const dynamic = "force-dynamic";

type Search = { method?: "BANK" | "CASH"; from?: string; to?: string; statement?: string };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { method = "BANK", from, to } = await searchParams;
  const dateFilter = (from || to)
    ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
    : {};

  const [receipts, payments, cashEntries] = await Promise.all([
    db.receipt.findMany({
      where: {
        associationId: DEFAULT_ASSOCIATION_ID,
        method,
        voided: false,
        ...dateFilter,
      },
      include: { resident: true },
      orderBy: [{ date: "asc" }, { receiptNo: "asc" }],
    }),
    db.billPayment.findMany({
      where: {
        method,
        ...dateFilter,
        bill: { associationId: DEFAULT_ASSOCIATION_ID, status: { not: "VOIDED" } },
      },
      include: { bill: { include: { supplier: true } } },
      orderBy: { date: "asc" },
    }),
    db.cashEntry.findMany({
      where: {
        associationId: DEFAULT_ASSOCIATION_ID,
        method,
        voided: false,
        ...dateFilter,
      },
      include: { account: { select: { code: true, name: true } } },
      orderBy: [{ date: "asc" }, { refNo: "asc" }],
    }),
  ]);

  // Cash book entries hit the same bank account, so they belong in the same
  // reconciliation as resident receipts and supplier payments.
  const cashIn = cashEntries.filter((c) => c.direction === "IN");
  const cashOut = cashEntries.filter((c) => c.direction === "OUT");

  const sumIf = <T extends { cleared: boolean; amount: unknown }>(rows: T[], cleared: boolean) =>
    rows.filter((r) => r.cleared === cleared).reduce((s, r) => s + Number(r.amount), 0);

  const clearedIn = sumIf(receipts, true) + sumIf(cashIn, true);
  const clearedOut = sumIf(payments, true) + sumIf(cashOut, true);
  const unclearedIn = sumIf(receipts, false) + sumIf(cashIn, false);
  const unclearedOut = sumIf(payments, false) + sumIf(cashOut, false);
  const bookBalanceCleared = clearedIn - clearedOut;
  const bookBalanceTotal = bookBalanceCleared + unclearedIn - unclearedOut;

  const accountLabel = method === "BANK" ? "RHB Bank (3300/0000)" : "Cash (3300/0010)";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description={`Reconcile ${accountLabel} against bank statement`}
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Method</label>
          <select name="method" defaultValue={method} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="BANK">Bank Transfer</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">From</label>
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">To</label>
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
        {(from || to) && (
          <Button type="button" variant="ghost" asChild><Link href={`/reconciliation?method=${method}`}>Clear</Link></Button>
        )}
      </form>

      <div className="grid gap-4 md:grid-cols-4">
        <StatBox label="Cleared in" value={fmtRM(clearedIn)} tone="positive" />
        <StatBox label="Cleared out" value={fmtRM(clearedOut)} tone="negative" />
        <StatBox label="Book balance (cleared)" value={fmtRM(bookBalanceCleared)} tone="neutral" highlight />
        <StatBox label="Book balance (all)" value={fmtRM(bookBalanceTotal)} tone="neutral" />
      </div>

      <StatementBalance bookBalanceCleared={bookBalanceCleared} />

      <DataCard>
        <div className="px-4 py-3 border-b text-sm font-medium flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Deposits in — {receipts.length + cashIn.length}{" "}
          {receipts.length + cashIn.length === 1 ? "receipt" : "receipts"}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Cleared</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-32">Receipt #</TableHead>
              <TableHead>Resident</TableHead>
              <TableHead className="w-40">Bank ref</TableHead>
              <TableHead className="w-40">Statement ref</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((r) => (
              <ReconcileRow
                key={r.id}
                kind="receipt"
                id={r.id}
                cleared={r.cleared}
                date={format(r.date, "dd MMM yyyy")}
                code={<Link className="underline" href={`/receipts/${r.id}`}>{r.receiptNo}</Link>}
                label={`${r.resident.ownerName} — ${r.resident.unitAddress}`}
                bankRef={r.bankRef ?? ""}
                statementRef={r.statementRef ?? ""}
                amount={Number(r.amount)}
                amountTone="positive"
              />
            ))}
            {cashIn.map((c) => (
              <ReconcileRow
                key={c.id}
                kind="cash"
                id={c.id}
                cleared={c.cleared}
                date={format(c.date, "dd MMM yyyy")}
                code={<Link className="underline" href={`/cash-book/${c.id}`}>{c.refNo}</Link>}
                label={`${c.counterparty ? c.counterparty + " — " : ""}${c.description}`}
                bankRef={c.bankRef ?? ""}
                statementRef={c.statementRef ?? ""}
                amount={Number(c.amount)}
                amountTone="positive"
              />
            ))}
          </TableBody>
        </Table>
        {receipts.length + cashIn.length === 0 && (
          <Empty icon={Landmark} title="No deposits" description="No receipts for this account in the selected range." />
        )}
      </DataCard>

      <DataCard>
        <div className="px-4 py-3 border-b text-sm font-medium flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
          Withdrawals out — {payments.length + cashOut.length}{" "}
          {payments.length + cashOut.length === 1 ? "payment" : "payments"}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Cleared</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-32">Bill #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="w-40">Bank ref</TableHead>
              <TableHead className="w-40">Statement ref</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <ReconcileRow
                key={p.id}
                kind="payment"
                id={p.id}
                cleared={p.cleared}
                date={format(p.date, "dd MMM yyyy")}
                code={<Link className="underline" href={`/bills/${p.billId}`}>{p.bill.invoiceNo}</Link>}
                label={p.bill.supplier.name}
                bankRef={p.bankRef ?? ""}
                statementRef={p.statementRef ?? ""}
                amount={Number(p.amount)}
                amountTone="negative"
              />
            ))}
            {cashOut.map((c) => (
              <ReconcileRow
                key={c.id}
                kind="cash"
                id={c.id}
                cleared={c.cleared}
                date={format(c.date, "dd MMM yyyy")}
                code={<Link className="underline" href={`/cash-book/${c.id}`}>{c.refNo}</Link>}
                label={`${c.counterparty ? c.counterparty + " — " : ""}${c.description}`}
                bankRef={c.bankRef ?? ""}
                statementRef={c.statementRef ?? ""}
                amount={Number(c.amount)}
                amountTone="negative"
              />
            ))}
          </TableBody>
        </Table>
        {payments.length + cashOut.length === 0 && (
          <Empty icon={Landmark} title="No withdrawals" description="No bill payments for this account in the selected range." />
        )}
      </DataCard>
    </div>
  );
}

function StatBox({ label, value, tone, highlight }: { label: string; value: string; tone: "positive" | "negative" | "neutral"; highlight?: boolean }) {
  const toneCls = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-rose-700" : "text-foreground";
  return (
    <div className={`rounded-lg border bg-card p-4 ${highlight ? "ring-1 ring-primary/30" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold font-mono tabular ${toneCls}`}>{value}</div>
    </div>
  );
}
