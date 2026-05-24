import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { generalLedger } from "@/lib/reports";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "../_components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { AccountPicker } from "./account-picker";
import { format } from "date-fns";
import { BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GLPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  const { accountId, from, to } = await searchParams;

  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  const range = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
  const data = accountId ? await generalLedger(accountId, range) : null;

  const description = !from && !to
    ? "All dates"
    : `Period: ${from ? format(new Date(from), "dd MMM yyyy") : "Beginning"} to ${to ? format(new Date(to), "dd MMM yyyy") : "Today"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        description={description}
        actions={
          <>
            <DateRange />
            {accountId && <ExportButtons slug="general-ledger" params={{ accountId, from, to }} />}
          </>
        }
      />
      <div className="rounded-xl border bg-card p-3">
        <AccountPicker accounts={accounts} selected={accountId} />
      </div>

      {data ? (
        <DataCard>
          <div className="px-4 py-2 border-b text-sm">
            <span className="font-mono">{data.account.code}</span> — {data.account.name}
            <span className="text-muted-foreground"> · Opening: <span className="font-mono tabular">{fmtRM(data.opening)}</span></span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32">Entry #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono">{r.entryNo}</TableCell>
                  <TableCell>{r.description}{r.memo ? ` — ${r.memo}` : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.debit.gt(0) ? fmtRM(r.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{r.credit.gt(0) ? fmtRM(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">Closing balance</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(data.closing)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DataCard>
      ) : (
        <DataCard>
          <Empty icon={BookOpen} title="Pick an account" description="Select an account from the picker above to view its ledger." />
        </DataCard>
      )}
    </div>
  );
}
