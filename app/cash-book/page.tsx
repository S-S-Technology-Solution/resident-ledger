import Link from "next/link";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, PAGE_SIZE, pageFrom } from "@/components/pager";
import { requireScreen } from "@/lib/screen-guard";
import { Writable } from "@/components/writable";

export const dynamic = "force-dynamic";

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireScreen("cash-book");
  const sp = await searchParams;
  const page = pageFrom(sp.page);
  const where = { associationId: DEFAULT_ASSOCIATION_ID };
  const [entries, total, sums] = await Promise.all([
    db.cashEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { refNo: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { account: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
    }),
    db.cashEntry.count({ where }),
    // Totals cover the whole cash book, not just the page on screen.
    db.cashEntry.groupBy({ by: ["direction"], where: { ...where, voided: false }, _sum: { amount: true } }),
  ]);

  const sumOf = (d: "IN" | "OUT") => Number(sums.find((s) => s.direction === d)?._sum.amount ?? 0);
  const totalIn = sumOf("IN");
  const totalOut = sumOf("OUT");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description="Receipts and payments with no resident or supplier behind them"
        actions={
          <>
            <Writable><Button asChild><Link href="/cash-book/new?direction=IN">New receipt</Link></Button></Writable>
            <Writable><Button asChild variant="outline"><Link href="/cash-book/new?direction=OUT">New payment voucher</Link></Button></Writable>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Received" value={fmtRM(totalIn)} />
        <Stat label="Paid out" value={fmtRM(totalOut)} />
        <Stat label="Net" value={fmtRM(totalIn - totalOut)} />
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-28">Ref</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-48">Account</TableHead>
              <TableHead className="w-20">Method</TableHead>
              <TableHead className="w-28 text-right">In</TableHead>
              <TableHead className="w-28 text-right">Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} className={e.voided ? "opacity-50" : ""}>
                <TableCell>{format(e.date, "dd MMM yyyy")}</TableCell>
                <TableCell className="font-mono">
                  <Link href={`/cash-book/${e.id}`} className="hover:underline">{e.refNo}</Link>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div>
                    {e.description}
                    {e.voided && <Badge variant="outline" className="ml-2">Voided</Badge>}
                  </div>
                  {e.counterparty && <div className="text-xs text-muted-foreground">{e.counterparty}</div>}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  <div className="font-mono text-xs">{e.account.code}</div>
                  <div className="text-xs">{e.account.name}{e._count.lines > 1 ? ` + ${e._count.lines - 1} more` : ""}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.method}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {e.direction === "IN" ? fmtRM(e.amount) : ""}
                </TableCell>
                <TableCell className="text-right font-mono tabular">
                  {e.direction === "OUT" ? fmtRM(e.amount) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {entries.length === 0 && (
          <Empty
            icon={Wallet}
            title="Nothing in the cash book yet"
            description="Use this for money in or out that has no resident or supplier behind it — bank interest, a donation, a sundry payment."
          />
        )}
        <Pager path="/cash-book" params={sp} page={page} total={total} />
      </DataCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular">{value}</div>
    </div>
  );
}
