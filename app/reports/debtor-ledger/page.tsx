import Link from "next/link";
import { format } from "date-fns";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { debtorLedger, creditorLedger } from "@/lib/subsidiary-ledger";
import { fmtRM } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { DateRange } from "../_components/date-range";

export const dynamic = "force-dynamic";

export default async function SubsidiaryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string; from?: string; to?: string }>;
}) {
  const { kind: rawKind, id, from, to } = await searchParams;
  const kind = rawKind === "creditor" ? "creditor" : "debtor";
  const range = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };

  const [residents, suppliers] = await Promise.all([
    db.resident.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: { debtorCode: "asc" },
      select: { id: true, debtorCode: true, unitAddress: true, ownerName: true },
    }),
    db.supplier.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      orderBy: { name: "asc" },
      select: { id: true, creditorCode: true, name: true },
    }),
  ]);

  const debtor = kind === "debtor" && id ? await debtorLedger(id, range) : null;
  const creditor = kind === "creditor" && id ? await creditorLedger(id, range) : null;
  const data = debtor ?? creditor;

  const heading = debtor
    ? `${debtor.resident.debtorCode ?? ""} ${debtor.resident.unitAddress} — ${debtor.resident.ownerName}`.trim()
    : creditor
      ? `${creditor.supplier.creditorCode ?? ""} ${creditor.supplier.name}`.trim()
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={kind === "debtor" ? "Debtor Ledger" : "Creditor Ledger"}
        description={heading ?? "Every invoice and payment for one account, with a running balance"}
        actions={<DateRange />}
      />

      <div className="flex gap-1 border-b no-print">
        <Link
          href="/reports/debtor-ledger?kind=debtor"
          className={kind === "debtor" ? "border-b-2 border-primary px-4 py-2 text-sm font-medium" : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"}
        >
          Debtors
        </Link>
        <Link
          href="/reports/debtor-ledger?kind=creditor"
          className={kind === "creditor" ? "border-b-2 border-primary px-4 py-2 text-sm font-medium" : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"}
        >
          Creditors
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-3 no-print">
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {kind === "debtor"
            ? residents.map((r) => (
                <Link
                  key={r.id}
                  href={`/reports/debtor-ledger?kind=debtor&id=${r.id}`}
                  className={
                    id === r.id
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                      : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                  }
                >
                  {r.debtorCode ?? r.unitAddress}
                </Link>
              ))
            : suppliers.map((s) => (
                <Link
                  key={s.id}
                  href={`/reports/debtor-ledger?kind=creditor&id=${s.id}`}
                  className={
                    id === s.id
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                      : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                  }
                >
                  {s.name}
                </Link>
              ))}
          {(kind === "debtor" ? residents : suppliers).length === 0 && (
            <span className="text-sm text-muted-foreground">Nothing to show yet.</span>
          )}
        </div>
      </div>

      {!data ? (
        <DataCard>
          <Empty
            icon={Users}
            title={kind === "debtor" ? "Pick a resident" : "Pick a supplier"}
            description="Choose an account above to see its ledger."
          />
        </DataCard>
      ) : (
        <DataCard>
          <div className="border-b px-4 py-2 text-sm">
            {heading}
            <span className="text-muted-foreground">
              {" "}· Opening <span className="font-mono tabular">{fmtRM(data.opening)}</span>
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-36">Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32 text-right">
                  {kind === "debtor" ? "Invoice" : "Payment"}
                </TableHead>
                <TableHead className="w-32 text-right">
                  {kind === "debtor" ? "Payment" : "Invoice"}
                </TableHead>
                <TableHead className="w-32 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{format(r.date, "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono">
                    {r.href ? <Link href={r.href} className="hover:underline">{r.ref}</Link> : r.ref}
                  </TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {r.debit.gt(0) ? fmtRM(r.debit) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {r.credit.gt(0) ? fmtRM(r.credit) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">Closing balance</TableCell>
                <TableCell className="text-right font-mono tabular font-semibold">
                  {fmtRM(data.closing)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {data.rows.length === 0 && (
            <Empty title="No movement" description="Nothing was posted to this account in the selected period." />
          )}
        </DataCard>
      )}
    </div>
  );
}
