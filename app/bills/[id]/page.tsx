import { notFound } from "next/navigation";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { fmtRM } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { VoidBillButton } from "./void-bill-button";
import { VoidPaymentButton } from "./void-payment-button";
import { DebitNoteButton } from "./debit-note-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";

export const dynamic = "force-dynamic";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen("bills");
  const { id } = await params;
  const bill = await db.bill.findUnique({
    where: { id },
    include: { supplier: true, payments: { orderBy: { date: "desc" } }, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!bill) notFound();
  // Bills keyed before lines existed carry their one account on the bill itself.
  const accounts = await db.account.findMany({
    where: { id: { in: [bill.expenseAccountId, ...bill.lines.map((l) => l.accountId)] } },
    select: { id: true, code: true, name: true },
  });
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const expense = acc.get(bill.expenseAccountId);
  const lines = bill.lines.length
    ? bill.lines.map((l) => ({ id: l.id, account: acc.get(l.accountId), description: l.description, rate: l.rate, amount: l.amount }))
    : [{ id: "single", account: expense, description: "", rate: null, amount: bill.amount }];

  const amount = new Decimal(bill.amount.toString());
  const paid = new Decimal(bill.paid.toString());
  const open = amount.minus(paid);

  const statusBadge =
    bill.status === "UNPAID" ? <Badge variant="outline">Unpaid</Badge> :
    bill.status === "PARTIAL" ? <Badge variant="secondary">Partial</Badge> :
    bill.status === "PAID" ? <Badge>Paid</Badge> :
    <Badge variant="destructive">Voided</Badge>;

  const description = [
    bill.supplier.name,
    format(bill.date, "dd MMM yyyy"),
    bill.lines.length <= 1 && expense ? `${expense.code} — ${expense.name}` : null,
    bill.dueDate ? `Due ${format(bill.dueDate, "dd MMM yyyy")}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bill ${bill.invoiceNo}`}
        description={description}
        actions={
          <div className="no-print flex gap-2 items-center">
            {statusBadge}
            {bill.status !== "VOIDED" && bill.status !== "PAID" && (
              <Writable>
                <DebitNoteButton billId={bill.id} open={Number(open)} />
                <Button asChild><Link href={`/bills/pay?supplierId=${bill.supplierId}&billId=${bill.id}`}>Pay</Link></Button>
              </Writable>
            )}
            {bill.status !== "VOIDED" && bill.payments.length === 0 && <Writable><VoidBillButton id={bill.id} /></Writable>}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Amount" value={`RM ${fmtRM(amount)}`} />
        <StatCard label="Paid" value={`RM ${fmtRM(paid)}`} />
        <StatCard label="Open" value={`RM ${fmtRM(open)}`} tone={open.gt(0) ? "bad" : "default"} />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Account</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono">{l.account?.code}</TableCell>
                <TableCell>{l.account?.name}</TableCell>
                <TableCell className="whitespace-normal">{l.description}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(l.amount)}</TableCell>
              </TableRow>
            ))}
            {lines.length > 1 && (
              <TableRow className="font-semibold">
                <TableCell colSpan={3}>Invoice total</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(amount)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataCard>

      <DataCard>
        {bill.payments.length === 0 ? (
          <Empty
            icon={Receipt}
            title="No payments yet"
            description="Payments recorded against this bill will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Cheque</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{format(p.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono">
                    {p.entryId ? <Link href={`/bills/voucher/${p.entryId}`} className="underline-offset-2 hover:underline">{p.voucherNo ?? "—"}</Link> : (p.voucherNo ?? "—")}
                    {p.method === "DEBIT_NOTE" && <span className="ml-2 text-xs text-muted-foreground">debit note</span>}
                  </TableCell>
                  <TableCell className="font-mono">{p.chequeNo ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(p.amount)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {p.method === "BANK" && bill.status !== "VOIDED" && (
                      <Link href={`/cheque/bill/${p.id}`} className="text-sm text-primary hover:underline">
                        Cheque
                      </Link>
                    )}
                    {bill.status !== "VOIDED" && <Writable><VoidPaymentButton id={p.id} /></Writable>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataCard>
    </div>
  );
}
