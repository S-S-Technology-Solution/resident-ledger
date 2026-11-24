import { notFound } from "next/navigation";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { controlAccount } from "@/lib/control-accounts";
import { monthlyFeeMonth } from "@/lib/monthly-fees";
import { fmtRM } from "@/lib/money";
import { entryHref } from "@/lib/drill";
import { canSeeScreen } from "@/lib/screens";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DrillLink } from "@/components/drill-link";
import { requireReport } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

/** The owners' bills behind a month's one line in the fee income ledger. */
export default async function FeeBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; description?: string }>;
}) {
  const account = await controlAccount("INCOME_FEE");
  const user = await requireReport("general-ledger", account.id);
  const { date, description } = await searchParams;
  const month = description && monthlyFeeMonth(description);
  if (!month || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) notFound();

  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      entry: {
        associationId: DEFAULT_ASSOCIATION_ID, source: "charge", status: { not: "DRAFT" },
        date: new Date(date), description,
      },
    },
    include: { entry: { select: { id: true, entryNo: true, status: true } } },
    orderBy: { entry: { entryNo: "asc" } },
  });
  if (lines.length === 0) notFound();
  const charges = await db.charge.findMany({
    where: { entryId: { in: lines.map((l) => l.entryId) } },
    select: {
      entryId: true, invoiceNo: true,
      resident: { select: { debtorCode: true, unitAddress: true, ownerName: true } },
    },
  });
  const chargeOf = new Map(charges.map((c) => [c.entryId, c]));
  // Owners are named only to someone who can see the bills themselves.
  const names = canSeeScreen(user, "charges");
  const total = lines.reduce((s, l) => s.plus(l.credit.toString()).minus(l.debit.toString()), new Decimal(0));
  const voided = lines.filter((l) => l.entry.status === "VOIDED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${month} ${account.name.toLowerCase()}`}
        description={`${format(new Date(date), "dd MMM yyyy")} · ${account.code} ${account.name} · ${lines.length} invoices${voided ? ` · ${voided} voided, reversed on their own lines in the ledger` : ""}`}
      />
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Invoice #</TableHead>
              <TableHead className="w-36">Entry</TableHead>
              <TableHead className="w-28">Debtor A/C</TableHead>
              <TableHead>Unit</TableHead>
              {names && <TableHead>Owner</TableHead>}
              <TableHead className="w-32 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const c = chargeOf.get(l.entryId);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono">
                    <DrillLink href={entryHref(l.entryId)}>{c?.invoiceNo ?? "—"}</DrillLink>
                    {l.entry.status === "VOIDED" && <Badge variant="destructive" className="ml-2">Voided</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.entry.entryNo}</TableCell>
                  <TableCell className="font-mono">{c?.resident.debtorCode}</TableCell>
                  <TableCell>{c?.resident.unitAddress}</TableCell>
                  {names && <TableCell>{c?.resident.ownerName}</TableCell>}
                  <TableCell className="text-right font-mono tabular">
                    <DrillLink href={entryHref(l.entryId)}>{fmtRM(l.credit.toString())}</DrillLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={names ? 5 : 4} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
