import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { getCurrentUser, canPost } from "@/lib/permissions";
import { bankDrafts, bookItems, reconciliation, type Pick } from "@/lib/bank-statement/service";
import { candidatesFor, guessResident, isBankCharge } from "@/lib/bank-statement/match";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineActions, type LineView } from "./line-actions";
import { StatementActions } from "./statement-actions";
import { requireScreen } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen("bank-statements");
  const { id } = await params;
  const statement = await db.bankStatement.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!statement) notFound();

  const [rec, items, drafts, residents, user] = await Promise.all([
    reconciliation(id),
    bookItems(statement.associationId),
    bankDrafts(statement.associationId),
    db.resident.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID },
      select: { id: true, debtorCode: true, unitAddress: true, ownerName: true },
      orderBy: { debtorCode: "asc" },
    }),
    getCurrentUser(),
  ]);

  const locked = !!statement.reconciledAt || !user || !canPost(user.role);
  const byKey = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]));
  const free = items.filter((i) => !i.line);

  const lines: (LineView & { date: Date; details: string; serial: string | null; debit: number; credit: number; balance: number })[] =
    statement.lines.map((l) => {
      const debit = Number(l.debit), credit = Number(l.credit);
      const details = l.details ? l.details.split("\n") : [];
      const picks: Pick[] = l.matchKind === "multi" ? ((l.matchItems as Pick[] | null) ?? [])
        : l.matchKind && l.matchKind !== "none" && l.matchId ? [{ kind: l.matchKind as Pick["kind"], id: l.matchId }] : [];
      const matchedItems = picks.map((p) => byKey.get(`${p.kind}:${p.id}`)).filter((i) => !!i);
      const matchedItem = matchedItems[0];
      // A split item lists its other lines; a multi line lists its other entries.
      const together = matchedItems.length > 1
        ? `With ${matchedItems.slice(1).map((i) => i.ref).join(", ")} — RM ${matchedItems.reduce((s, i) => s + i.amount, 0).toFixed(2)} in all`
        : matchedItem && matchedItem.lines.length > 1
          ? `Split over ${matchedItem.lines.map((x) => x.ref).join(" + ")} — RM ${matchedItem.amount.toFixed(2)} in all`
          : null;
      const amount = credit > 0 ? credit : debit;
      const draft = l.matchKind ? undefined : drafts.find((d) => {
        const days = (l.date.getTime() - d.date.getTime()) / 86_400_000;
        return d.direction === (credit > 0 ? "IN" : "OUT") && Math.abs(d.amount - amount) < 0.005 && days >= -3 && days <= 14;
      });
      const guess = !l.matchKind && credit > 0 ? guessResident(details, residents) : null;
      return {
        id: l.id, ref: l.ref, date: l.date, details: details.join(" · "), serial: l.serial, debit, credit,
        balance: Number(l.balance), isIn: credit > 0, amount: credit > 0 ? credit : debit, type: l.type,
        matched: matchedItem ? { ref: matchedItem.ref, label: matchedItem.label, href: matchedItem.href } : null,
        together,
        draft: draft ? { id: draft.id, number: draft.number, party: draft.party } : null,
        noEntry: l.matchKind === "none" ? (l.note ?? "") : null,
        candidates: l.matchKind ? [] : candidatesFor({ date: l.date, debit, credit, serial: l.serial }, free, guess?.resident.id)
          .slice(0, 4)
          .map((c) => ({
            kind: c.item.kind, id: c.item.id, ref: c.item.ref, label: c.item.label,
            date: format(c.item.date, "d MMM"), refAgrees: c.refAgrees,
          })),
        guess: guess ? { residentId: guess.resident.id, how: guess.how } : null,
        isCharge: debit > 0 && isBankCharge(l.type),
      };
    });

  const residentOptions = residents.map((r) => ({
    value: r.id,
    label: `${r.unitAddress} — ${r.ownerName}`,
    hint: r.debtorCode ?? undefined,
  }));
  const unmatchedHere = lines.filter((l) => !l.matched && l.noEntry === null);
  const matchedHere = lines.length - unmatchedHere.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Statement ${format(statement.periodFrom, "d MMM")} – ${format(statement.periodTo, "d MMM yyyy")}`}
        description={`${statement.bank} ${statement.accountNo} · ${statement.fileName} · ${matchedHere} of ${lines.length} lines matched`}
        actions={
          <div className="flex items-center gap-2">
            {statement.reconciledAt && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                Reconciled {format(statement.reconciledAt, "d MMM yyyy")}
              </Badge>
            )}
            {user && canPost(user.role) && (
              <StatementActions
                statementId={statement.id}
                reconciled={!!statement.reconciledAt}
                canSignOff={rec.canSignOff}
                unmatched={unmatchedHere.length}
              />
            )}
          </div>
        }
      />

      <ReconciliationStatement rec={rec} />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Line</TableHead>
              <TableHead className="w-20">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28 text-right">Debit</TableHead>
              <TableHead className="w-28 text-right">Credit</TableHead>
              <TableHead className="w-32 text-right">Balance</TableHead>
              <TableHead className="min-w-[22rem]">In the books</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const done = l.matched || l.noEntry !== null;
              return (
                <TableRow key={l.id} className={done ? "bg-emerald-50/40" : ""}>
                  <TableCell className="font-mono text-xs align-top">{l.ref}</TableCell>
                  <TableCell className="text-sm align-top whitespace-nowrap">{format(l.date, "d MMM")}</TableCell>
                  <TableCell className="text-sm align-top whitespace-normal min-w-[18rem]">
                    <div className="font-medium whitespace-nowrap">{l.type}{l.serial ? <span className="ml-2 font-mono text-xs text-muted-foreground">{l.serial}</span> : null}</div>
                    {l.details && <div className="text-xs text-muted-foreground">{l.details}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular align-top text-rose-700">{l.debit ? fmtRM(l.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular align-top text-emerald-700">{l.credit ? fmtRM(l.credit) : ""}</TableCell>
                  <TableCell className="text-right font-mono tabular align-top">{fmtRM(l.balance)}</TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <LineActions
                      line={l}
                      residents={residentOptions}
                      locked={locked}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataCard>

      <p className="text-xs text-muted-foreground">
        <Link className="underline" href="/bank-statements">All statements</Link>
      </p>
    </div>
  );
}

type Rec = Awaited<ReturnType<typeof reconciliation>>;

function Row({ label, value, sub, strong }: { label: string; value: number; sub?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] gap-x-6 py-1.5 ${strong ? "border-t font-semibold" : ""}`}>
      <div>{label}{sub}</div>
      <div className="text-right font-mono tabular">{fmtRM(value)}</div>
    </div>
  );
}

function List({ rows }: { rows: { key: string; left: string; right: number }[] }) {
  if (!rows.length) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Show {rows.length}</summary>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between gap-4"><span>{r.left}</span><span className="font-mono tabular">{fmtRM(r.right)}</span></li>
        ))}
      </ul>
    </details>
  );
}

function ReconciliationStatement({ rec }: { rec: Rec }) {
  const lineNet = (ls: Rec["unmatched"]) => ls.reduce((s, l) => s.plus(l.credit.toString()).minus(l.debit.toString()), new Decimal(0));
  const itemSum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const agrees = rec.difference.abs().lt(0.005);

  const bankLineRows = (ls: Rec["unmatched"]) =>
    ls.map((l) => ({ key: l.id, left: `${format(l.date, "d MMM")} ${l.ref} ${l.type}${l.note ? ` — ${l.note}` : ""}`, right: Number(l.credit) - Number(l.debit) }));
  const itemRows = (xs: Rec["unpresented"]) =>
    xs.map((i) => ({ key: i.id, left: `${format(i.date, "d MMM")} ${i.ref} ${i.label}`, right: i.amount }));

  return (
    <div className="rounded-lg border bg-card p-4 text-sm max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Bank reconciliation as at {format(rec.asAt, "d MMMM yyyy")}</h2>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${agrees && !rec.unmatched.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {agrees && !rec.unmatched.length
            ? "Agrees"
            : rec.unmatched.length
              ? `${rec.unmatched.length} line${rec.unmatched.length === 1 ? "" : "s"} to match up to this date`
              : "Does not agree"}
        </span>
      </div>
      <Row label="Balance as per bank statement" value={rec.bankBalance.toNumber()} />
      <Row label="Add: deposits in the books, not yet credited by the bank" value={itemSum(rec.depositsInTransit)} sub={<List rows={itemRows(rec.depositsInTransit)} />} />
      <Row label="Less: payments in the books, not yet presented" value={0 - itemSum(rec.unpresented) || 0} sub={<List rows={itemRows(rec.unpresented)} />} />
      {rec.noEntry.length > 0 && (
        <Row label="Bank items with no book entry (net)" value={0 - lineNet(rec.noEntry).toNumber() || 0} sub={<List rows={bankLineRows(rec.noEntry)} />} />
      )}
      {rec.unmatched.length > 0 && (
        <Row label="Statement lines not yet matched, this and earlier months (net)" value={0 - lineNet(rec.unmatched).toNumber() || 0} sub={<List rows={bankLineRows(rec.unmatched)} />} />
      )}
      <Row label="Adjusted bank balance" value={rec.adjusted.toNumber()} strong />
      <Row label="Balance as per cash book" value={rec.bookBalance.toNumber()} />
      <Row label="Difference" value={rec.difference.toNumber()} strong />
    </div>
  );
}
