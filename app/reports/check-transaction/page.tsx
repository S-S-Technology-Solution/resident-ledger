import Link from "next/link";
import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

type Search = { q?: string; amount?: string; from?: string; to?: string; status?: string };

/**
 * Transaction enquiry — find a posting when you know roughly what you are looking
 * for but not where it lives. Covers Million's "Check Transaction" and the
 * transaction voucher listing in one screen.
 */
export default async function CheckTransactionPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { q, amount, from, to, status } = await searchParams;
  const hasFilter = Boolean(q || amount || from || to || status);

  const where: Prisma.JournalEntryWhereInput = { associationId: DEFAULT_ASSOCIATION_ID };
  if (status) where.status = status as Prisma.EnumJournalStatusFilter["equals"];
  if (from || to) {
    where.date = { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };
  }
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
      { entryNo: { contains: q, mode: "insensitive" } },
    ];
  }
  if (amount) {
    // Match either side, so you can search by a figure off a bank statement.
    where.lines = { some: { OR: [{ debit: amount }, { credit: amount }] } };
  }

  const entries = hasFilter
    ? await db.journalEntry.findMany({
        where,
        include: {
          batch: { select: { batchNo: true } },
          lines: { include: { account: { select: { code: true, name: true } } } },
        },
        orderBy: [{ date: "desc" }, { entryNo: "desc" }],
        take: 200,
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check Transaction"
        description="Find a posting by amount, reference, description or date"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 no-print">
        <div className="space-y-1">
          <label htmlFor="q" className="block text-xs text-muted-foreground">
            Description, reference or entry no.
          </label>
          <Input id="q" name="q" defaultValue={q ?? ""} className="w-64" placeholder="e.g. OR-2608 or security" />
        </div>
        <div className="space-y-1">
          <label htmlFor="amount" className="block text-xs text-muted-foreground">Exact amount</label>
          <Input id="amount" name="amount" defaultValue={amount ?? ""} className="w-32 text-right font-mono" placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <label htmlFor="from" className="block text-xs text-muted-foreground">From</label>
          <Input id="from" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="block text-xs text-muted-foreground">To</label>
          <Input id="to" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="block text-xs text-muted-foreground">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Any</option>
            <option value="POSTED">Posted</option>
            <option value="DRAFT">Draft</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>
        <Button type="submit">Search</Button>
        {hasFilter && (
          <Button type="button" variant="ghost" asChild>
            <Link href="/reports/check-transaction">Clear</Link>
          </Button>
        )}
      </form>

      {!hasFilter ? (
        <DataCard>
          <Empty
            icon={Search}
            title="Search for a transaction"
            description="Enter an amount off a bank statement, part of a description, or a date range."
          />
        </DataCard>
      ) : (
        <DataCard>
          <div className="border-b px-4 py-2 text-sm text-muted-foreground">
            {entries.length === 200 ? "First 200 matches" : `${entries.length} ${entries.length === 1 ? "match" : "matches"}`}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32">Entry #</TableHead>
                <TableHead className="w-24">Batch</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32">Accounts</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => {
                const total = e.lines.reduce((s, l) => s + Number(l.debit), 0);
                return (
                  <TableRow key={e.id} className={e.status === "VOIDED" ? "opacity-60" : ""}>
                    <TableCell>{format(e.date, "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono">
                      <Link href={`/journal/${e.id}`} className="hover:underline">{e.entryNo}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {e.batch?.batchNo ?? "—"}
                    </TableCell>
                    <TableCell>
                      {e.description}
                      {e.reference && (
                        <span className="text-muted-foreground"> · {e.reference}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.lines.map((l) => l.account.code).join(" / ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.status === "POSTED" ? "default" : "outline"}>{e.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">{fmtRM(total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {entries.length === 0 && (
            <Empty
              icon={Search}
              title="Nothing matched"
              description="Try a wider date range, or search on part of the description instead of the exact amount."
            />
          )}
        </DataCard>
      )}
    </div>
  );
}
