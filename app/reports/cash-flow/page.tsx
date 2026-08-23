import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

const CASH_CODES = ["3300/0000", "3300/0010"];

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : new Date();

  const cashAccounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, code: { in: CASH_CODES } },
    select: { id: true, code: true, name: true },
  });
  const cashIds = cashAccounts.map((a) => a.id);

  // Every entry that moves cash, paired with whatever sat on the other side.
  const cashLines = await db.journalLine.findMany({
    where: {
      accountId: { in: cashIds },
      entry: {
        associationId: DEFAULT_ASSOCIATION_ID,
        status: "POSTED",
        date: { ...(fromDate && { gte: fromDate }), lte: toDate },
      },
    },
    include: {
      entry: { include: { lines: { include: { account: true } } } },
    },
  });

  // Opening cash: everything before the window.
  const openingLines = fromDate
    ? await db.journalLine.findMany({
        where: {
          accountId: { in: cashIds },
          entry: { associationId: DEFAULT_ASSOCIATION_ID, status: "POSTED", date: { lt: fromDate } },
        },
        select: { debit: true, credit: true },
      })
    : [];

  const opening = openingLines.reduce(
    (s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())),
    new Decimal(0),
  );

  // Group the movement by the account on the other side of each cash line.
  const buckets = new Map<string, { code: string; name: string; type: string; inflow: Decimal; outflow: Decimal }>();

  for (const line of cashLines) {
    const net = new Decimal(line.debit.toString()).minus(new Decimal(line.credit.toString()));
    if (net.isZero()) continue;

    const others = line.entry.lines.filter((l) => !cashIds.includes(l.accountId));
    const otherTotal = others.reduce(
      (s, l) => s.plus(new Decimal(l.debit.toString())).plus(new Decimal(l.credit.toString())),
      new Decimal(0),
    );
    if (otherTotal.isZero()) continue;

    for (const o of others) {
      const share = new Decimal(o.debit.toString()).plus(new Decimal(o.credit.toString()));
      if (share.isZero()) continue;
      const portion = net.times(share).dividedBy(otherTotal);
      const key = o.account.code;
      const b = buckets.get(key) ?? {
        code: o.account.code, name: o.account.name, type: o.account.type,
        inflow: new Decimal(0), outflow: new Decimal(0),
      };
      if (portion.gt(0)) b.inflow = b.inflow.plus(portion);
      else b.outflow = b.outflow.plus(portion.abs());
      buckets.set(key, b);
    }
  }

  const rows = [...buckets.values()].sort((a, b) => a.code.localeCompare(b.code));
  const inflows = rows.filter((r) => r.inflow.gt(r.outflow));
  const outflows = rows.filter((r) => r.outflow.gte(r.inflow));

  const totalIn = rows.reduce((s, r) => s.plus(r.inflow), new Decimal(0));
  const totalOut = rows.reduce((s, r) => s.plus(r.outflow), new Decimal(0));
  const movement = totalIn.minus(totalOut);
  const closing = opening.plus(movement);

  const description = fromDate
    ? `${format(fromDate, "dd MMM yyyy")} to ${format(toDate, "dd MMM yyyy")}`
    : `Up to ${format(toDate, "dd MMM yyyy")}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Cash Flow Statement" description={description} actions={<DateRange />} />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Source of movement</TableHead>
              <TableHead className="w-40 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={2} className="font-semibold">Cash at start of period</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(opening)}</TableCell>
            </TableRow>

            <TableRow className="bg-muted/20">
              <TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cash received
              </TableCell>
            </TableRow>
            {inflows.map((r) => (
              <TableRow key={`in-${r.code}`}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {fmtRM(r.inflow.minus(r.outflow))}
                </TableCell>
              </TableRow>
            ))}
            {inflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm italic text-muted-foreground">
                  Nothing received in this period
                </TableCell>
              </TableRow>
            )}

            <TableRow className="bg-muted/20">
              <TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cash paid out
              </TableCell>
            </TableRow>
            {outflows.map((r) => (
              <TableRow key={`out-${r.code}`}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  ({fmtRM(r.outflow.minus(r.inflow))})
                </TableCell>
              </TableRow>
            ))}
            {outflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm italic text-muted-foreground">
                  Nothing paid out in this period
                </TableCell>
              </TableRow>
            )}

            <TableRow>
              <TableCell colSpan={2} className="font-semibold">Net movement in cash</TableCell>
              <TableCell className={`text-right font-mono tabular font-semibold ${movement.isNegative() ? "text-rose-600" : ""}`}>
                {fmtRM(movement)}
              </TableCell>
            </TableRow>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={2} className="font-semibold">Cash at end of period</TableCell>
              <TableCell className="text-right font-mono tabular font-semibold">{fmtRM(closing)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Built from movements on {cashAccounts.map((a) => `${a.code} ${a.name}`).join(" and ")}, grouped by
        the account on the other side of each entry.
      </p>
    </div>
  );
}
