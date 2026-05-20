import Link from "next/link";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "POSTED", "VOIDED"] as const;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const { q, status, from, to } = await searchParams;

  const entries = await db.journalEntry.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      ...(status ? { status: status as "DRAFT" | "POSTED" | "VOIDED" } : {}),
      ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
      ...(q ? {
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } },
          { entryNo: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: { lines: true },
    orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        description={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        actions={<Button asChild><Link href="/journal/new">New Entry</Link></Button>}
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input name="q" defaultValue={q ?? ""} placeholder="Description, reference, entry #…" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" name="to" defaultValue={to ?? ""} />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <Button type="submit" variant="outline">Apply</Button>
        {(q || from || to || status) && (
          <Button type="button" variant="ghost" asChild><Link href="/journal">Clear</Link></Button>
        )}
      </form>

      <nav className="flex items-center gap-1 text-sm border-b">
        <Link href={`/journal${qs({ q, from, to })}`} className={cn("px-3 py-2 -mb-px border-b-2", !status ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/journal${qs({ q, from, to, status: s })}`}
            className={cn("px-3 py-2 -mb-px border-b-2 uppercase text-xs tracking-wide", status === s ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{s}</Link>
        ))}
      </nav>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const total = e.lines.reduce((a, l) => a + Number(l.debit), 0);
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-mono">{e.entryNo}</TableCell>
                  <TableCell>{format(e.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{e.description}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{e.reference ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(total)}</TableCell>
                  <TableCell>
                    {e.status === "DRAFT" && <Badge variant="outline">Draft</Badge>}
                    {e.status === "POSTED" && <Badge>Posted</Badge>}
                    {e.status === "VOIDED" && <Badge variant="destructive">Voided</Badge>}
                  </TableCell>
                  <TableCell><Link className="text-sm underline" href={`/journal/${e.id}`}>Open</Link></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {entries.length === 0 && (
          <Empty
            icon={ScrollText}
            title={q || status || from || to ? "No entries match" : "No journal entries"}
            description={q || status || from || to ? "Adjust filters or clear them." : "Create your first entry, or one will be created automatically when you record a charge, receipt or bill."}
            action={!q && !status && !from && !to && <Button asChild><Link href="/journal/new">New Entry</Link></Button>}
          />
        )}
      </DataCard>
    </div>
  );
}

function qs(p: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
