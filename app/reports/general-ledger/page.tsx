import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID, getAssociation } from "@/lib/association";
import { generalLedgerAll } from "@/lib/reports";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { AccountPicker } from "./account-picker";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { BookOpen } from "lucide-react";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

/** A balance with its side: "74,265.77 Dr". */
const side = (v: Decimal) => (v.eq(0) ? "0.00" : `${fmtRM(v.abs())} ${v.gt(0) ? "Dr" : "Cr"}`);

export default async function GLPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  await requireScreen("reports");
  const sp = await searchParams;
  const association = await getAssociation();
  const to = sp.to || new Date().toISOString().slice(0, 10);
  // Default period: from the start of the financial year to the "to" date.
  const fyStart = `${to.slice(0, 4)}-${String(association.fiscalYearStart).padStart(2, "0")}-01`;
  const from = sp.from || (fyStart <= to ? fyStart : `${Number(to.slice(0, 4)) - 1}${fyStart.slice(4)}`);

  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const sections = await generalLedgerAll({ from: new Date(from), to: new Date(to), accountId: sp.accountId });

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        description={`From ${format(new Date(from), "dd MMM yyyy")} to ${format(new Date(to), "dd MMM yyyy")} · each account starts with its balance brought forward`}
        actions={
          <>
            <DateRange />
            <ExportButtons slug="general-ledger" params={{ accountId: sp.accountId, from, to }} />
          </>
        }
      />
      <div className="rounded-xl border bg-card p-3 no-print">
        <AccountPicker accounts={accounts} selected={sp.accountId} />
      </div>

      {sections.length === 0 && (
        <DataCard><Empty icon={BookOpen} title="Nothing in this period" description="No account has a balance or entries for these dates." /></DataCard>
      )}
      {sections.map((s) => (
        <DataCard key={s.account.id} className="break-inside-avoid">
          <div className="border-b px-4 py-2 text-sm font-semibold">
            <span className="font-mono">{s.account.code}</span> &nbsp; {s.account.name}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-20">Batch</TableHead>
                <TableHead className="w-32">Ref. No.</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
                <TableHead className="w-36 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">Balance B/F</TableCell>
                <TableCell /><TableCell />
                <TableCell className="text-right font-mono tabular">{side(s.opening)}</TableCell>
              </TableRow>
              {s.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{format(r.date, "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{r.batch}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                  <TableCell className="whitespace-normal">{r.description}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{side(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={4}>Total · closing balance</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(s.debit)}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(s.credit)}</TableCell>
                <TableCell className="text-right font-mono tabular">{side(s.closing)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DataCard>
      ))}
    </div>
  );
}
