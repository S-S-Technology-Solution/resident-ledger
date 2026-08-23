import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

/**
 * Fixed assets at cost less accumulated depreciation.
 *
 * Cost accounts are classified "FA" and their depreciation counterpart "FD".
 * The two are paired by account code: 2010/0000 cost pairs with 2010/0100 depn.
 */
export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const asOf = to ? new Date(to) : new Date();

  const accounts = await db.account.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      classifiedAs: { in: ["FA", "FD"] },
    },
    include: {
      lines: {
        where: { entry: { status: "POSTED", date: { lte: asOf } } },
        select: { debit: true, credit: true },
      },
    },
    orderBy: { code: "asc" },
  });

  const balanceOf = (a: (typeof accounts)[number]) =>
    a.lines.reduce(
      (s, l) => s.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString())),
      new Decimal(0),
    );

  const costs = accounts.filter((a) => a.classifiedAs === "FA");
  const depns = accounts.filter((a) => a.classifiedAs === "FD");

  // Pair on the code stem — everything before the slash.
  const stem = (code: string) => code.split("/")[0];
  const depnByStem = new Map(depns.map((d) => [stem(d.code), d]));

  const rows = costs.map((c) => {
    const depn = depnByStem.get(stem(c.code));
    const cost = balanceOf(c);
    // Depreciation sits credit-side, so flip the sign to show it as a positive figure.
    const accumulated = depn ? balanceOf(depn).negated() : new Decimal(0);
    return {
      code: c.code,
      name: c.name,
      depnCode: depn?.code ?? null,
      cost,
      accumulated,
      nbv: cost.minus(accumulated),
    };
  });

  const visible = rows.filter((r) => !r.cost.isZero() || !r.accumulated.isZero());
  const totalCost = visible.reduce((s, r) => s.plus(r.cost), new Decimal(0));
  const totalDepn = visible.reduce((s, r) => s.plus(r.accumulated), new Decimal(0));
  const totalNbv = totalCost.minus(totalDepn);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed Assets"
        description={`Cost less accumulated depreciation as at ${format(asOf, "dd MMM yyyy")}`}
        actions={<DateRange />}
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead className="w-28">Depn A/C</TableHead>
              <TableHead className="w-36 text-right">Cost</TableHead>
              <TableHead className="w-40 text-right">Accum. depreciation</TableHead>
              <TableHead className="w-36 text-right">Net book value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{r.depnCode ?? "—"}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.cost)}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {r.accumulated.isZero() ? "—" : `(${fmtRM(r.accumulated)})`}
                </TableCell>
                <TableCell className="text-right font-mono tabular font-medium">
                  {fmtRM(r.nbv)}
                </TableCell>
              </TableRow>
            ))}
            {visible.length > 0 && (
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">
                  {fmtRM(totalCost)}
                </TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">
                  ({fmtRM(totalDepn)})
                </TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">
                  {fmtRM(totalNbv)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {visible.length === 0 && (
          <Empty
            title="No fixed assets"
            description="Accounts classified FA (cost) and FD (accumulated depreciation) appear here once they carry a balance."
          />
        )}
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Cost and depreciation accounts are paired on the account code — 2010/0000 pairs with 2010/0100.
        An asset with no matching FD account shows its full cost as net book value.
      </p>
    </div>
  );
}
