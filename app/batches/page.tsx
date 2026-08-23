import Link from "next/link";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { GROUP_LABEL } from "@/lib/batches";
import { fmtRM } from "@/lib/money";
import { GenerateBatchDialog, LockBatchButton, DeleteBatchButton } from "./generate-dialog";

export const dynamic = "force-dynamic";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const filterYear = year ? Number(year) : undefined;

  const batches = await db.batch.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, ...(filterYear ? { year: filterYear } : {}) },
    orderBy: [{ year: "desc" }, { month: "desc" }, { group: "asc" }],
    include: {
      entries: {
        where: { status: "POSTED" },
        select: { id: true, lines: { select: { debit: true } } },
      },
    },
  });

  const years = [...new Set(batches.map((b) => b.year))].sort((a, b) => b - a);
  const allYears = filterYear
    ? [...new Set([...years, filterYear])].sort((a, b) => b - a)
    : years;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description="Transactions are filed into a monthly batch per group, the way the accountant works"
        actions={<GenerateBatchDialog defaultYear={new Date().getFullYear()} />}
      />

      {allYears.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/batches"
            className={
              !filterYear
                ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            }
          >
            All years
          </Link>
          {allYears.map((y) => (
            <Link
              key={y}
              href={`/batches?year=${y}`}
              className={
                filterYear === y
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Batch No.</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-36">Type</TableHead>
              <TableHead className="w-24 text-right">Entries</TableHead>
              <TableHead className="w-36 text-right">Value</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => {
              const value = b.entries.reduce(
                (s, e) => s + e.lines.reduce((t, l) => t + Number(l.debit), 0),
                0,
              );
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-mono font-medium">{b.batchNo}</TableCell>
                  <TableCell>{b.description}</TableCell>
                  <TableCell className="text-muted-foreground">{GROUP_LABEL[b.group]}</TableCell>
                  <TableCell className="text-right tabular">{b.entries.length}</TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {b.entries.length ? fmtRM(value) : "—"}
                  </TableCell>
                  <TableCell>
                    {b.locked ? <Badge variant="outline">Locked</Badge> : <Badge>Open</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link
                      href={`/reports/batch-transactions?batch=${b.batchNo}`}
                      className="text-sm text-primary hover:underline mr-2"
                    >
                      Print
                    </Link>
                    <LockBatchButton id={b.id} locked={b.locked} />
                    {b.entries.length === 0 && <DeleteBatchButton id={b.id} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {batches.length === 0 && (
          <Empty
            icon={Layers}
            title="No batches yet"
            description="A batch is created automatically the first time something is posted into a month, or generate them ahead of time."
          />
        )}
      </DataCard>
    </div>
  );
}
