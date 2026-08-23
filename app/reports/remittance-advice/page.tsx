import Link from "next/link";
import { format } from "date-fns";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { getAssociation } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { PrintButton } from "@/app/receipts/[id]/print-button";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

export default async function RemittanceAdvicePage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; from?: string; to?: string }>;
}) {
  const { supplierId, from, to } = await searchParams;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const [suppliers, association] = await Promise.all([
    db.supplier.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: { name: "asc" },
      select: { id: true, name: true, creditorCode: true },
    }),
    getAssociation(),
  ]);

  const supplier = supplierId
    ? await db.supplier.findUnique({ where: { id: supplierId } })
    : null;

  const payments = supplier
    ? await db.billPayment.findMany({
        where: {
          bill: { supplierId: supplier.id, associationId: DEFAULT_ASSOCIATION_ID },
          ...(fromDate || toDate
            ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
            : {}),
        },
        include: { bill: true },
        orderBy: { date: "asc" },
      })
    : [];

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remittance Advice"
        description={supplier ? supplier.name : "Which invoices a payment settled, to send to the supplier"}
        actions={
          <>
            <DateRange />
            {supplier && payments.length > 0 && <PrintButton />}
          </>
        }
      />

      <div className="rounded-xl border bg-card p-3 no-print">
        <div className="flex flex-wrap gap-2">
          {suppliers.map((s) => (
            <Link
              key={s.id}
              href={`/reports/remittance-advice?supplierId=${s.id}`}
              className={
                supplierId === s.id
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {s.name}
            </Link>
          ))}
          {suppliers.length === 0 && (
            <span className="text-sm text-muted-foreground">No suppliers yet.</span>
          )}
        </div>
      </div>

      {!supplier ? (
        <DataCard>
          <Empty icon={Truck} title="Pick a supplier" description="Choose a supplier above to build their remittance advice." />
        </DataCard>
      ) : payments.length === 0 ? (
        <DataCard>
          <Empty
            icon={Truck}
            title="No payments in this period"
            description={`Nothing has been paid to ${supplier.name} in the selected dates.`}
          />
        </DataCard>
      ) : (
        <article className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
          <header className="border-b px-8 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{association.name}</div>
                {association.registrationNo && (
                  <div className="text-xs text-muted-foreground">Reg. No: {association.registrationNo}</div>
                )}
                {association.address && (
                  <div className="whitespace-pre-line text-xs text-muted-foreground">{association.address}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Remittance Advice</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {format(new Date(), "dd MMM yyyy")}
                </div>
              </div>
            </div>
          </header>

          <div className="border-b px-8 py-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">To</div>
            <div className="mt-1 font-semibold">{supplier.name}</div>
            {supplier.creditorCode && (
              <div className="font-mono text-xs text-muted-foreground">{supplier.creditorCode}</div>
            )}
          </div>

          <div className="px-8 py-5">
            <p className="mb-3 text-sm text-muted-foreground">
              The following payments have been made and settle the invoices listed.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="w-32">Method</TableHead>
                  <TableHead className="w-40">Reference</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{format(p.date, "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono">{p.bill.invoiceNo}</TableCell>
                    <TableCell className="text-muted-foreground">{p.method}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {p.bankRef ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">{fmtRM(p.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="font-semibold">Total remitted</TableCell>
                  <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <footer className="flex justify-end px-8 pb-8 pt-10 text-xs text-muted-foreground">
            <div className="text-right">
              <div className="italic text-foreground/70">Computer Generated</div>
              <div className="mt-1 font-medium text-foreground/80">Treasurer</div>
              <div className="mt-0.5 text-[10px]">{association.name}</div>
            </div>
          </footer>
        </article>
      )}
    </div>
  );
}
