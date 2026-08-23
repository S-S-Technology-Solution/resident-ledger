import Link from "next/link";
import { format } from "date-fns";
import { Layers } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { GROUP_LABEL } from "@/lib/batches";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { ExportButtons } from "@/components/export-buttons";

export const dynamic = "force-dynamic";

export default async function BatchTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; view?: string }>;
}) {
  const { batch: batchNo, view } = await searchParams;
  const detail = view !== "summary";

  const batches = await db.batch.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: [{ year: "desc" }, { month: "desc" }, { group: "asc" }],
    select: { id: true, batchNo: true, description: true },
  });

  const batch = batchNo
    ? await db.batch.findUnique({
        where: { associationId_batchNo: { associationId: DEFAULT_ASSOCIATION_ID, batchNo } },
        include: {
          entries: {
            where: { status: "POSTED" },
            orderBy: [{ date: "asc" }, { entryNo: "asc" }],
            include: { lines: { include: { account: true }, orderBy: { lineNo: "asc" } } },
          },
        },
      })
    : null;

  const totalDr = batch?.entries.reduce(
    (s, e) => s + e.lines.reduce((t, l) => t + Number(l.debit), 0), 0,
  ) ?? 0;
  const totalCr = batch?.entries.reduce(
    (s, e) => s + e.lines.reduce((t, l) => t + Number(l.credit), 0), 0,
  ) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch of Transactions"
        description={batch ? `${batch.batchNo} — ${batch.description}` : "Select a batch to print"}
        actions={
          batch && (
            <div className="flex items-center gap-2 no-print">
              <ExportButtons slug="batch-transactions" params={{ batch: batch.batchNo }} />
              <Link
                href={`/reports/batch-transactions?batch=${batch.batchNo}`}
                className={detail ? "rounded-md border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground" : "rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"}
              >
                Detail
              </Link>
              <Link
                href={`/reports/batch-transactions?batch=${batch.batchNo}&view=summary`}
                className={!detail ? "rounded-md border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground" : "rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"}
              >
                Summary
              </Link>
            </div>
          )
        }
      />

      <div className="rounded-xl border bg-card p-3 no-print">
        <div className="flex flex-wrap gap-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/reports/batch-transactions?batch=${b.batchNo}${detail ? "" : "&view=summary"}`}
              className={
                batchNo === b.batchNo
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {b.batchNo}
            </Link>
          ))}
          {batches.length === 0 && (
            <span className="text-sm text-muted-foreground">No batches yet.</span>
          )}
        </div>
      </div>

      {!batch ? (
        <DataCard>
          <Empty
            icon={Layers}
            title="Pick a batch"
            description="Choose a batch number above to list everything posted in it."
          />
        </DataCard>
      ) : batch.entries.length === 0 ? (
        <DataCard>
          <Empty
            icon={Layers}
            title="Nothing posted in this batch"
            description={`${batch.description} has no posted entries yet.`}
          />
        </DataCard>
      ) : (
        <DataCard>
          <div className="border-b px-4 py-2 text-sm text-muted-foreground">
            {GROUP_LABEL[batch.group]} · {batch.entries.length}{" "}
            {batch.entries.length === 1 ? "entry" : "entries"}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32">Entry #</TableHead>
                {detail && <TableHead className="w-28">A/C No.</TableHead>}
                <TableHead>Description</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.entries.map((e) => {
                const entryDr = e.lines.reduce((s, l) => s + Number(l.debit), 0);
                const entryCr = e.lines.reduce((s, l) => s + Number(l.credit), 0);
                if (!detail) {
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{format(e.date, "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-mono">
                        <Link href={`/journal/${e.id}`} className="hover:underline">{e.entryNo}</Link>
                      </TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="text-right font-mono tabular">{fmtRM(entryDr)}</TableCell>
                      <TableCell className="text-right font-mono tabular">{fmtRM(entryCr)}</TableCell>
                    </TableRow>
                  );
                }
                return e.lines.map((l, i) => (
                  <TableRow key={l.id}>
                    <TableCell>{i === 0 ? format(e.date, "dd MMM yyyy") : ""}</TableCell>
                    <TableCell className="font-mono">
                      {i === 0 ? (
                        <Link href={`/journal/${e.id}`} className="hover:underline">{e.entryNo}</Link>
                      ) : ""}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{l.account.code}</TableCell>
                    <TableCell>
                      {i === 0 ? e.description : <span className="text-muted-foreground">{l.account.name}</span>}
                      {l.memo && i > 0 ? ` — ${l.memo}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">
                      {Number(l.debit) > 0 ? fmtRM(l.debit) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">
                      {Number(l.credit) > 0 ? fmtRM(l.credit) : ""}
                    </TableCell>
                  </TableRow>
                ));
              })}
              <TableRow>
                <TableCell colSpan={detail ? 4 : 3} className="font-semibold">Batch total</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalDr)}</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(totalCr)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DataCard>
      )}
    </div>
  );
}
