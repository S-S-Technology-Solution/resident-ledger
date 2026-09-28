import Link from "next/link";
import { format } from "date-fns";
import { FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function BankStatementsPage() {
  const statements = await db.bankStatement.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID },
    orderBy: { periodFrom: "desc" },
    include: { lines: { select: { matchKind: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Statements"
        description="Upload each month's RHB statement, pair its lines with the books, and sign off the reconciliation."
      />

      <UploadForm />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="w-40">Account</TableHead>
              <TableHead className="w-36 text-right">Opening</TableHead>
              <TableHead className="w-36 text-right">Closing</TableHead>
              <TableHead className="w-32 text-right">Lines matched</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((s) => {
              const done = s.lines.filter((l) => l.matchKind).length;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link className="font-medium underline" href={`/bank-statements/${s.id}`}>
                      {format(s.periodFrom, "d MMM")} – {format(s.periodTo, "d MMM yyyy")}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.bank} {s.accountNo}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(Number(s.openingBalance))}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmtRM(Number(s.closingBalance))}</TableCell>
                  <TableCell className="text-right font-mono tabular">{done} / {s.lines.length}</TableCell>
                  <TableCell>
                    {s.reconciledAt
                      ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Reconciled</Badge>
                      : done === s.lines.length
                        ? <Badge variant="secondary">Ready to sign off</Badge>
                        : <Badge variant="outline">In progress</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {statements.length === 0 && (
          <Empty
            icon={FileSpreadsheet}
            title="No statements yet"
            description="Start with the statement that opens on the cut-over date, then upload each month in turn."
          />
        )}
      </DataCard>
    </div>
  );
}
