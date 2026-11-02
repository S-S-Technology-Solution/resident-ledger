import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { fmtRM } from "@/lib/money";
import { glHref, entryHref } from "@/lib/drill";
import { canSeeScreen, type ScreenKey } from "@/lib/screens";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DrillLink } from "@/components/drill-link";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

/** The document an entry was posted from, and the screen it lives on. */
function sourceDocument(e: { id: string; source: string; sourceId: string | null }): { label: string; href: string; screen: ScreenKey } | null {
  const id = e.sourceId;
  switch (e.source) {
    case "receipt": return id ? { label: "Open the receipt", href: `/receipts/${id}`, screen: "receipts" } : null;
    case "creditnote": return id ? { label: "Open the credit note", href: `/receipts/${id}`, screen: "receipts" } : null;
    case "charge": return id ? { label: "Open the charge", href: `/charges/${id}`, screen: "charges" } : null;
    case "debitnote": return id ? { label: "Open the debit note", href: `/charges/${id}`, screen: "charges" } : null;
    case "refund": return id ? { label: "Open the refund", href: `/charges/${id}`, screen: "charges" } : null;
    case "bill": return id ? { label: "Open the bill", href: `/bills/${id}`, screen: "bills" } : null;
    case "billpayment":
    case "supplierdebitnote": return { label: "Open the payment voucher", href: `/bills/voucher/${e.id}`, screen: "bills" };
    case "cash": return id ? { label: "Open the cash book entry", href: `/cash-book/${id}`, screen: "cash-book" } : null;
    case "manual": return { label: "Open in Journal", href: `/journal/${e.id}`, screen: "journal" };
    default: return null;
  }
}

const SOURCE_LABEL: Record<string, string> = {
  receipt: "Official receipt", creditnote: "Credit note", charge: "Charge", debitnote: "Debit note",
  refund: "Refund", bill: "Supplier bill", billpayment: "Payment voucher", supplierdebitnote: "Supplier debit note",
  cash: "Cash book", manual: "Journal", opening: "Opening balance", yearend: "Year-end closing", reversal: "Reversal",
};

/** One posting in full, read-only: every account it touched, reached from a ledger line. */
export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireScreen("reports");
  const { id } = await params;
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { lineNo: "asc" }, include: { account: { select: { id: true, code: true, name: true } } } },
      batch: { select: { batchNo: true } },
      reverses: { select: { id: true, entryNo: true } },
      reversedBy: { select: { id: true, entryNo: true } },
    },
  });
  if (!entry) notFound();

  const day = entry.date.toISOString().slice(0, 10);
  const debit = entry.lines.reduce((s, l) => s.plus(l.debit.toString()), new Decimal(0));
  const credit = entry.lines.reduce((s, l) => s.plus(l.credit.toString()), new Decimal(0));
  const source = sourceDocument(entry);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${SOURCE_LABEL[entry.source] ?? "Entry"} ${entry.reference ?? entry.entryNo}`}
        description={`${format(entry.date, "dd MMM yyyy")} · entry ${entry.entryNo}${entry.batch ? ` · batch ${entry.batch.batchNo}` : ""}`}
        actions={
          <>
            {entry.status === "DRAFT" && <Badge variant="outline">Draft</Badge>}
            {entry.status === "VOIDED" && <Badge variant="destructive">Voided</Badge>}
            {source && canSeeScreen(user, source.screen) && (
              <Button asChild variant="outline"><Link href={source.href}>{source.label}</Link></Button>
            )}
          </>
        }
      />

      <div className="space-y-1 text-sm">
        <p>{entry.description}</p>
        {entry.status === "VOIDED" && entry.voidReason && <p className="text-muted-foreground">Voided: {entry.voidReason}</p>}
        {entry.reverses && (
          <p className="text-muted-foreground">
            Reverses entry <DrillLink href={entryHref(entry.reverses.id)}>{entry.reverses.entryNo}</DrillLink>
          </p>
        )}
        {entry.reversedBy && (
          <p className="text-muted-foreground">
            Reversed by entry <DrillLink href={entryHref(entry.reversedBy.id)}>{entry.reversedBy.entryNo}</DrillLink>
          </p>
        )}
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-32 text-right">Debit</TableHead>
              <TableHead className="w-32 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono">{l.account.code}</TableCell>
                <TableCell><DrillLink href={glHref(l.account.id, { to: day })}>{l.account.name}</DrillLink></TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{l.memo}</TableCell>
                <TableCell className="text-right font-mono tabular">{Number(l.debit) ? fmtRM(l.debit.toString()) : ""}</TableCell>
                <TableCell className="text-right font-mono tabular">{Number(l.credit) ? fmtRM(l.credit.toString()) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(debit)}</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(credit)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DataCard>
    </div>
  );
}
