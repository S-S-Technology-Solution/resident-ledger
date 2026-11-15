import Link from "next/link";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";
import { Pager, PAGE_SIZE, pageFrom } from "@/components/pager";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";
import { journalWhere, JOURNAL_ORDER, JOURNAL_STATUSES } from "@/lib/list-filters";
import { ExportButtons } from "@/components/export-buttons";
import { SOURCE_LABEL } from "@/lib/entry-source";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; keyed?: string; page?: string }>;
}) {
  await requireScreen("journal");
  const sp = await searchParams;
  const { q, status, from, to, keyed } = sp;
  const page = pageFrom(sp.page);

  const where = journalWhere({ q, status, from, to, keyed });
  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: { lines: true },
      orderBy: JOURNAL_ORDER,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.journalEntry.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        description={`${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`}
        actions={
          <>
            <ExportButtons slug="journal" params={{ q, status, from, to, keyed }} />
            <Writable><Button asChild><Link href="/journal/new">New Entry</Link></Button></Writable>
          </>
        }
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
        {keyed && <input type="hidden" name="keyed" value={keyed} />}
        <Button type="submit" variant="outline">Apply</Button>
        {(q || from || to || status || keyed) && (
          <Button type="button" variant="ghost" asChild><Link href="/journal">Clear</Link></Button>
        )}
      </form>

      <nav className="flex items-center gap-1 text-sm border-b">
        <Link href={`/journal${qs({ q, from, to, keyed })}`} className={cn("px-3 py-2 -mb-px border-b-2", !status ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>All</Link>
        {JOURNAL_STATUSES.map((s) => (
          <Link key={s} href={`/journal${qs({ q, from, to, keyed, status: s })}`}
            className={cn("px-3 py-2 -mb-px border-b-2 uppercase text-xs tracking-wide", status === s ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{s}</Link>
        ))}
        {/* Only the vouchers keyed here, or also what receipts, vouchers and bills posted. */}
        <Link href={`/journal${qs({ q, from, to, status, keyed: keyed ? undefined : "1" })}`}
          className={cn("ml-auto mb-1 rounded-md border px-3 py-1 text-xs", keyed ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          Journal vouchers only
        </Link>
      </nav>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{SOURCE_LABEL[e.source] ?? e.source}</TableCell>
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
            title={q || status || from || to || keyed ? "No entries match" : "No journal entries"}
            description={q || status || from || to || keyed ? "Adjust filters or clear them." : "Create your first entry, or one will be created automatically when you record a charge, receipt or bill."}
            action={!q && !status && !from && !to && <Writable><Button asChild><Link href="/journal/new">New Entry</Link></Button></Writable>}
          />
        )}
        <Pager path="/journal" params={sp} page={page} total={total} />
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
