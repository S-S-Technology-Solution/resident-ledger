import Link from "next/link";
import Decimal from "decimal.js";
import { format, differenceInCalendarDays } from "date-fns";
import { CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "unpaid", label: "Unpaid invoices" },
  { key: "paid", label: "Paid invoices" },
  { key: "due", label: "Payment due" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/** Resident invoices are due 30 days after issue — the same basis as the ageing report. */
const TERMS_DAYS = 30;

export default async function InvoiceListingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === raw) ? (raw as ViewKey) : "unpaid";
  const today = new Date();

  const charges = await db.charge.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, voided: false },
    include: {
      resident: { select: { id: true, debtorCode: true, unitAddress: true, ownerName: true } },
      allocations: { include: { receipt: { select: { voided: true } } } },
    },
    orderBy: [{ date: "asc" }, { invoiceNo: "asc" }],
  });

  const rows = charges
    .map((c) => {
      const amount = new Decimal(c.amount.toString());
      const paid = c.allocations
        .filter((a) => !a.receipt.voided)
        .reduce((s, a) => s.plus(new Decimal(a.amount.toString())), new Decimal(0));
      const open = amount.minus(paid);
      const dueDate = new Date(c.date.getTime() + TERMS_DAYS * 86400000);
      return { charge: c, amount, paid, open, dueDate, settled: open.lte(0) };
    })
    .filter((r) => {
      if (view === "paid") return r.settled;
      if (view === "due") return !r.settled && differenceInCalendarDays(r.dueDate, today) <= 7;
      return !r.settled;
    });

  const total = rows.reduce((s, r) => s.plus(r.amount), new Decimal(0));
  const outstanding = rows.reduce((s, r) => s.plus(r.open), new Decimal(0));

  return (
    <div className="space-y-6">
      <PageHeader
        title={VIEWS.find((v) => v.key === view)!.label}
        description={
          view === "due"
            ? `Unsettled invoices already past ${TERMS_DAYS} days or falling due within a week`
            : view === "paid"
              ? "Resident invoices settled in full"
              : "Resident invoices with something still outstanding"
        }
      />

      <div className="flex gap-1 border-b no-print">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/reports/invoice-listing?view=${v.key}`}
            className={
              view === v.key
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium"
                : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Invoices" value={String(rows.length)} />
        <Stat label="Total billed" value={fmtRM(total)} />
        <Stat label="Still outstanding" value={fmtRM(outstanding)} />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-32">Invoice #</TableHead>
              <TableHead className="w-28">Debtor A/C</TableHead>
              <TableHead>Resident</TableHead>
              <TableHead className="w-28">Due</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-32 text-right">Paid</TableHead>
              <TableHead className="w-32 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const overdue = !r.settled && r.dueDate < today;
              return (
                <TableRow key={r.charge.id}>
                  <TableCell>{format(r.charge.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono">
                    <Link href={`/charges/${r.charge.id}`} className="hover:underline">
                      {r.charge.invoiceNo ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {r.charge.resident.debtorCode ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/residents/${r.charge.resident.id}`} className="hover:underline">
                      {r.charge.resident.unitAddress}
                    </Link>
                    <span className="text-muted-foreground"> · {r.charge.resident.ownerName}</span>
                    {r.charge.isOpeningBalance && (
                      <Badge variant="outline" className="ml-2">b/f</Badge>
                    )}
                  </TableCell>
                  <TableCell className={overdue ? "text-rose-600" : "text-muted-foreground"}>
                    {format(r.dueDate, "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.amount)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.paid)}</TableCell>
                  <TableCell className="text-right font-mono tabular font-medium">
                    {fmtRM(r.open)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty
            icon={CreditCard}
            title="Nothing to show"
            description={
              view === "due"
                ? "No invoices are falling due in the next seven days."
                : view === "paid"
                  ? "No invoices have been settled in full yet."
                  : "Every invoice has been settled."
            }
          />
        )}
      </DataCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular">{value}</div>
    </div>
  );
}
