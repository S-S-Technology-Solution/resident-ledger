import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { FileText, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { residentOutstanding } from "@/lib/ar";
import { fmtRM } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { VoidChargeButton } from "@/app/charges/void-charge-button";

export const dynamic = "force-dynamic";

export default async function ResidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await db.resident.findUnique({ where: { id } });
  if (!resident) notFound();

  const outstanding = await residentOutstanding(id);
  const balance = outstanding.reduce((s, c) => s.plus(c.open), new Decimal(0));
  const openCharges = outstanding.filter((c) => c.open.gt(0));

  const receipts = await db.receipt.findMany({
    where: { residentId: id },
    orderBy: { date: "desc" },
    take: 50,
  });

  const charges = await db.charge.findMany({
    where: { residentId: id },
    orderBy: { date: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={resident.unitAddress}
        description={resident.ownerName + (resident.phone ? ` · ${resident.phone}` : "")}
        actions={
          <div className="no-print flex gap-2">
            <Button asChild variant="outline"><Link href={`/residents/${id}/statement`}>Statement</Link></Button>
            <Button asChild variant="outline"><Link href={`/charges/new?residentId=${id}`}>Add Charge</Link></Button>
            <Button asChild><Link href={`/receipts/new?residentId=${id}`}>Take Payment</Link></Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Monthly Fee" value={`RM ${fmtRM(resident.monthlyFee)}`} />
        <StatCard
          label="Outstanding Balance"
          value={`RM ${fmtRM(balance)}`}
          tone={balance.gt(0) ? "bad" : "default"}
        />
        <StatCard label="Open Charges" value={String(openCharges.length)} />
      </div>

      <DataCard>
        {openCharges.length === 0 ? (
          <Empty
            icon={FileText}
            title="No open charges"
            description="This resident has no outstanding charges."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openCharges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{format(c.date, "dd MMM yyyy")}</TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell>{c.periodYear}-{String(c.periodMonth).padStart(2, "0")}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(c.amount)}</TableCell>
                  <TableCell className="text-right font-mono tabular text-muted-foreground">{fmtRM(c.allocated)}</TableCell>
                  <TableCell className={cn("text-right font-mono tabular", c.open.gt(0) ? "text-rose-600 font-semibold" : "text-muted-foreground")}>{fmtRM(c.open)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataCard>

      <div className="grid md:grid-cols-2 gap-6">
        <DataCard>
          {receipts.length === 0 ? (
            <Empty
              icon={Receipt}
              title="No receipts yet"
              description="Payments recorded for this resident will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono">{r.receiptNo}</TableCell>
                    <TableCell className="text-right font-mono tabular">{fmtRM(r.amount)}</TableCell>
                    <TableCell>{r.voided ? <Badge variant="destructive">Voided</Badge> : <Link className="text-sm underline" href={`/receipts/${r.id}`}>View</Link>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
        <DataCard>
          {charges.length === 0 ? (
            <Empty
              icon={FileText}
              title="No charges yet"
              description="Charges raised for this resident will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{format(c.date, "dd MMM yyyy")}</TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell className="text-right font-mono tabular">{fmtRM(c.amount)}</TableCell>
                    <TableCell className="text-right">
                      {c.voided ? <Badge variant="destructive">Voided</Badge> : <VoidChargeButton id={c.id} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataCard>
      </div>
    </div>
  );
}
