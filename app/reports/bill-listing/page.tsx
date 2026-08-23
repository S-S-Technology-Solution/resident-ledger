import Link from "next/link";
import { format, differenceInCalendarDays } from "date-fns";
import { FileText } from "lucide-react";
import { BillStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { ExportButtons } from "@/components/export-buttons";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "unpaid", label: "Unpaid bills" },
  { key: "paid", label: "Paid bills" },
  { key: "due", label: "Payment due" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export default async function BillListingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === raw) ? (raw as ViewKey) : "unpaid";
  const today = new Date();

  const where =
    view === "paid"
      ? { status: BillStatus.PAID }
      : { status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] } };

  const bills = await db.bill.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, ...where },
    include: { supplier: true, payments: { orderBy: { date: "desc" } } },
    orderBy: [{ dueDate: "asc" }, { date: "asc" }],
  });

  // "Payment due" narrows the open bills to those already due or due within a week.
  const rows =
    view === "due"
      ? bills.filter((b) => b.dueDate && differenceInCalendarDays(b.dueDate, today) <= 7)
      : bills;

  const total = rows.reduce((s, b) => s + Number(b.amount), 0);
  const outstanding = rows.reduce((s, b) => s + (Number(b.amount) - Number(b.paid)), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={VIEWS.find((v) => v.key === view)!.label}
        description={
          view === "due"
            ? "Open bills already overdue or falling due within seven days"
            : view === "paid"
              ? "Bills settled in full"
              : "Bills with something still outstanding"
        }
        actions={<ExportButtons slug="bill-listing" params={{ view }} />}
      />

      <div className="flex gap-1 border-b no-print">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/reports/bill-listing?view=${v.key}`}
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
        <Stat label="Bills" value={String(rows.length)} />
        <Stat label="Total billed" value={fmtRM(total)} />
        <Stat label="Still outstanding" value={fmtRM(outstanding)} />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-36">Invoice #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="w-28">Due</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-32 text-right">Paid</TableHead>
              <TableHead className="w-32 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => {
              const balance = Number(b.amount) - Number(b.paid);
              const overdue = b.dueDate && b.dueDate < today && balance > 0;
              return (
                <TableRow key={b.id}>
                  <TableCell>{format(b.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono">
                    <Link href={`/bills/${b.id}`} className="hover:underline">{b.invoiceNo}</Link>
                  </TableCell>
                  <TableCell>
                    {b.supplier.name}
                    {b.isOpeningBalance && (
                      <span className="ml-2 text-xs text-muted-foreground">brought forward</span>
                    )}
                  </TableCell>
                  <TableCell className={overdue ? "text-rose-600" : "text-muted-foreground"}>
                    {b.dueDate ? format(b.dueDate, "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.status === "PAID" ? "default" : "outline"}>{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(b.amount)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(b.paid)}</TableCell>
                  <TableCell className="text-right font-mono tabular font-medium">
                    {fmtRM(balance)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty
            icon={FileText}
            title="Nothing to show"
            description={
              view === "due"
                ? "No bills are due in the next seven days."
                : view === "paid"
                  ? "No bills have been paid in full yet."
                  : "Every bill has been settled."
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
