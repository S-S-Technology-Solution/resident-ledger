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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CashEntryDialog } from "./entry-dialog";

export const dynamic = "force-dynamic";

export default async function CashBookPage() {
  const [entries, accounts] = await Promise.all([
    db.cashEntry.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: [{ date: "desc" }, { refNo: "desc" }],
      take: 200,
      include: { account: { select: { code: true, name: true } } },
    }),
    db.account.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true, type: { in: ["INCOME", "EXPENSE"] } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
  ]);

  const live = entries.filter((e) => !e.voided);
  const totalIn = live.filter((e) => e.direction === "IN").reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = live.filter((e) => e.direction === "OUT").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description="Receipts and payments with no resident or supplier behind them"
        actions={
          <>
            <CashEntryDialog direction="IN" accounts={accounts} />
            <CashEntryDialog direction="OUT" accounts={accounts} />
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
              <TableHead className="w-52">Account</TableHead>
              <TableHead className="w-24">Method</TableHead>
              <TableHead className="w-32 text-right">In</TableHead>
              <TableHead className="w-32 text-right">Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} className={e.voided ? "opacity-50" : ""}>
                <TableCell>{format(e.date, "dd MMM yyyy")}</TableCell>
                <TableCell className="font-mono">
                  <Link href={`/cash-book/${e.id}`} className="hover:underline">{e.refNo}</Link>
                </TableCell>
                <TableCell>
                  {e.description}
                  {e.counterparty && (
                    <span className="text-muted-foreground"> · {e.counterparty}</span>
                  )}
                  {e.voided && <Badge variant="outline" className="ml-2">Voided</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="font-mono">{e.account.code}</span> {e.account.name}
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
