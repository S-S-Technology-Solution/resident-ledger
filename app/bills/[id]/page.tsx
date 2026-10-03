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
    include: { supplier: true, payments: { orderBy: { date: "desc" } } },
  });
  if (!bill) notFound();
  const expense = await db.account.findUnique({ where: { id: bill.expenseAccountId } });

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
    expense ? `${expense.code} — ${expense.name}` : null,
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
