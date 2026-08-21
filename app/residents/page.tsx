import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResidentDialog } from "./resident-dialog";
import { ToggleResident } from "./toggle-resident";
import { residentBalances } from "@/lib/ar";
import { fmtRM } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const all = await residentBalances();
  const rows = q
    ? all.filter((r) => r.unitAddress.toLowerCase().includes(q.toLowerCase()) || r.ownerName.toLowerCase().includes(q.toLowerCase()) || r.debtorCode?.toLowerCase().includes(q.toLowerCase()))
    : all;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Residents"
        description={`${rows.length} of ${all.length}`}
        actions={<ResidentDialog mode="create" />}
      />

      <form className="max-w-sm">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search address or name…" />
      </form>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Debtor A/C</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Monthly Fee</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-muted-foreground">{r.debtorCode ?? "—"}</TableCell>
                <TableCell><Link href={`/residents/${r.id}`} className="font-medium hover:underline">{r.unitAddress}</Link></TableCell>
                <TableCell className="text-muted-foreground">{r.ownerName}</TableCell>
                <TableCell className="text-right font-mono tabular">{fmtRM(r.monthlyFee)}</TableCell>
                <TableCell className={`text-right font-mono tabular ${r.balance.gt(0) ? "text-rose-600 font-semibold" : ""}`}>{fmtRM(r.balance)}</TableCell>
                <TableCell>{r.active ? <Badge>Active</Badge> : <Badge variant="outline">Moved out</Badge>}</TableCell>
                <TableCell className="text-right space-x-2">
                  <ResidentDialog mode="edit" resident={{
                    id: r.id, unitAddress: r.unitAddress, ownerName: r.ownerName,
                    phone: "", monthlyFee: r.monthlyFee.toFixed(2),
                  }} />
                  <ToggleResident id={r.id} active={r.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Empty
            icon={Users}
            title={q ? "No matching residents" : "No residents yet"}
            description={q ? "Try a different search." : "Add residents to start tracking charges and payments."}
            action={!q && <ResidentDialog mode="create" />}
          />
        )}
      </DataCard>
    </div>
  );
}
