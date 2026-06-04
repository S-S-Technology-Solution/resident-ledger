import Link from "next/link";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { controlAccount } from "@/lib/control-accounts";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

type AccountKey = "BANK" | "CASH";

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  const { from, to, account } = await searchParams;
  const accountKey: AccountKey = account === "CASH" ? "CASH" : "BANK";
  const acc = await controlAccount(accountKey);

  const now = new Date();
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = to ? new Date(to) : now;
  toDate.setHours(23, 59, 59, 999);

  const [linesBefore, linesInRange] = await Promise.all([
    db.journalLine.findMany({
      where: { accountId: acc.id, entry: { date: { lt: fromDate }, status: "POSTED" } },
      select: { debit: true, credit: true },
    }),
    db.journalLine.findMany({
      where: { accountId: acc.id, entry: { date: { gte: fromDate, lte: toDate }, status: "POSTED" } },
      include: { entry: true },
    }),
  ]);

  const opening = linesBefore.reduce(
    (s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())),
    new Decimal(0),
  );

  // For each line, resolve payee/counterparty by looking up the source row.
  const billPaymentIds = linesInRange
    .filter((l) => l.entry.source === "billpayment" && l.entry.sourceId)
    .map((l) => l.entry.sourceId as string);
  const receiptIds = linesInRange
    .filter((l) => l.entry.source === "receipt" && l.entry.sourceId)
    .map((l) => l.entry.sourceId as string);

  const [billPayments, receipts] = await Promise.all([
    billPaymentIds.length
      ? db.billPayment.findMany({
          where: { id: { in: billPaymentIds } },
          include: { bill: { include: { supplier: true } } },
        })
      : Promise.resolve([]),
    receiptIds.length
      ? db.receipt.findMany({
          where: { id: { in: receiptIds } },
          include: { resident: true },
        })
      : Promise.resolve([]),
  ]);
  const bpMap = new Map(billPayments.map((p) => [p.id, p]));
  const rcMap = new Map(receipts.map((r) => [r.id, r]));

  const sorted = [...linesInRange].sort(
    (a, b) =>
      a.entry.date.getTime() - b.entry.date.getTime() ||
      a.entry.entryNo.localeCompare(b.entry.entryNo),
  );

  let running = opening;
  const rows = sorted.map((l) => {
    const debit = new Decimal(l.debit.toString());
    const credit = new Decimal(l.credit.toString());
    running = running.plus(debit).minus(credit);
    let payee = "—";
    let voucher = l.entry.entryNo;
    if (l.entry.source === "billpayment" && l.entry.sourceId) {
      const bp = bpMap.get(l.entry.sourceId);
      if (bp) {
        payee = bp.bill.supplier.name;
        voucher = bp.bankRef || bp.bill.invoiceNo || l.entry.entryNo;
      }
    } else if (l.entry.source === "receipt" && l.entry.sourceId) {
      const r = rcMap.get(l.entry.sourceId);
      if (r) {
        payee = `${r.resident.unitAddress} — ${r.resident.ownerName}`;
        voucher = r.receiptNo;
      }
    }
    return {
      key: l.id,
      date: l.entry.date,
      voucher,
      payee,
      description: l.entry.description,
      debit,
      credit,
      balance: running,
    };
  });

  const totalIn = rows.reduce((s, r) => s.plus(r.debit), new Decimal(0));
  const totalOut = rows.reduce((s, r) => s.plus(r.credit), new Decimal(0));
  const closing = running;

  const accountLabel = accountKey === "BANK" ? "Bank (3300/0000)" : "Cash on hand (3300/0010)";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description={`${accountLabel} · ${format(fromDate, "dd MMM yyyy")} — ${format(toDate, "dd MMM yyyy")}`}
        actions={
          <div className="flex items-end gap-3 no-print">
            <div className="flex rounded-md border bg-card p-0.5 text-sm">
              <Link
                href={{ pathname: "/reports/cash-book", query: { account: "BANK", from, to } }}
                className={`px-3 py-1 rounded ${accountKey === "BANK" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                Bank
              </Link>
              <Link
                href={{ pathname: "/reports/cash-book", query: { account: "CASH", from, to } }}
                className={`px-3 py-1 rounded ${accountKey === "CASH" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                Cash
              </Link>
            </div>
            <DateRange mode="range" />
          </div>
        }
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Voucher #</TableHead>
              <TableHead>Payee / From</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Receipt (In)</TableHead>
              <TableHead className="text-right">Payment (Out)</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{format(fromDate, "dd MMM yyyy")}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="font-medium">Balance brought forward</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(opening)}</TableCell>
            </TableRow>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm italic text-muted-foreground">
                  No movements on this account in the selected period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{r.voucher}</TableCell>
                  <TableCell>{r.payee}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.balance)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">Period totals</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalIn)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalOut)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(closing)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
