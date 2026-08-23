import Decimal from "decimal.js";
import { format } from "date-fns";
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

/** Print a slice of the chart of accounts with balances — Million's "Print Range of Accounts". */
export default async function AccountRangePage({
  searchParams,
}: {
  searchParams: Promise<{ fromCode?: string; toCode?: string; to?: string; zero?: string }>;
}) {
  const { fromCode, toCode, to, zero } = await searchParams;
  const asOf = to ? new Date(to) : new Date();
  const includeZero = zero === "1";

  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    include: {
      lines: {
        where: { entry: { status: "POSTED", date: { lte: asOf } } },
        select: { debit: true, credit: true },
      },
    },
    orderBy: { code: "asc" },
  });

  const inRange = accounts.filter((a) => {
    if (fromCode && a.code < fromCode) return false;
    if (toCode && a.code > toCode) return false;
    return true;
  });

  const rows = inRange
    .map((a) => {
      const dr = a.lines.reduce((s, l) => s.plus(new Decimal(l.debit.toString())), new Decimal(0));
      const cr = a.lines.reduce((s, l) => s.plus(new Decimal(l.credit.toString())), new Decimal(0));
      const raw = dr.minus(cr);
      // Show each account on its natural side as a positive figure.
      const balance = a.normalSide === "DEBIT" ? raw : raw.negated();
      return { account: a, dr, cr, balance };
    })
    .filter((r) => includeZero || !r.balance.isZero());

  const totalDr = rows.reduce((s, r) => s.plus(r.dr), new Decimal(0));
  const totalCr = rows.reduce((s, r) => s.plus(r.cr), new Decimal(0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Range of Accounts"
        description={`Chart of accounts with balances as at ${format(asOf, "dd MMM yyyy")}`}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 no-print">
        <div className="space-y-1">
          <label htmlFor="fromCode" className="block text-xs text-muted-foreground">From A/C</label>
          <Input id="fromCode" name="fromCode" defaultValue={fromCode ?? ""} className="w-32 font-mono" placeholder="1000/0000" />
        </div>
        <div className="space-y-1">
          <label htmlFor="toCode" className="block text-xs text-muted-foreground">To A/C</label>
          <Input id="toCode" name="toCode" defaultValue={toCode ?? ""} className="w-32 font-mono" placeholder="90U1/000" />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="block text-xs text-muted-foreground">As at</label>
          <Input id="to" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="zero" value="1" defaultChecked={includeZero} />
          Include accounts with no balance
        </label>
        <Button type="submit">Apply</Button>
      </form>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Group</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-20">Side</TableHead>
              <TableHead className="w-36 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.account.id} className={r.account.active ? "" : "opacity-60"}>
                <TableCell className="font-mono">{r.account.code}</TableCell>
                <TableCell>
                  {r.account.name}
                  {!r.account.active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.account.group}</TableCell>
                <TableCell className="text-muted-foreground">{r.account.type}</TableCell>
                <TableCell className="text-muted-foreground">{r.account.normalSide === "DEBIT" ? "Dr" : "Cr"}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.balance)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">
                  {rows.length} accounts · movement Dr {fmtRM(totalDr)} / Cr {fmtRM(totalCr)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty
            title="No accounts in this range"
            description="Widen the code range, or tick the box to include accounts with no balance."
          />
        )}
      </DataCard>
    </div>
  );
}
