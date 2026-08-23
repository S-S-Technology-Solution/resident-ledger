import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/empty";
import { fmtRM } from "@/lib/money";
import { listFiscalYears } from "@/lib/year-end";
import { CloseYearDialog, ReopenYearButton } from "./close-dialog";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default async function YearEndPage() {
  const { years, lockedThrough } = await listFiscalYears();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Year End Closing"
        description="Close a financial year to carry the result into the accumulated fund and lock the year"
      />

      <div className="rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">Postings are currently locked up to</span>{" "}
        <span className="font-medium">{fmtDate(lockedThrough)}</span>
        {!lockedThrough && (
          <span className="text-muted-foreground"> — nothing is locked yet.</span>
        )}
      </div>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Year</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Closed on</TableHead>
              <TableHead className="text-right w-40">Surplus / (deficit)</TableHead>
              <TableHead className="text-right w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((y) => (
              <TableRow key={y.year}>
                <TableCell className="font-medium">{y.year}</TableCell>
                <TableCell>
                  {y.closed ? <Badge>Closed</Badge> : <Badge variant="outline">Open</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(y.closedAt)}</TableCell>
                <TableCell className={`text-right font-mono tabular ${y.surplus && Number(y.surplus) < 0 ? "text-rose-600" : ""}`}>
                  {y.surplus ? fmtRM(y.surplus) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {y.closed ? <ReopenYearButton year={y.year} /> : <CloseYearDialog year={y.year} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {years.length === 0 && (
          <Empty
            title="Nothing to close yet"
            description="Once transactions have been posted, the years they fall in appear here."
          />
        )}
      </DataCard>
    </div>
  );
}
