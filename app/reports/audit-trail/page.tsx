import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { listAudit } from "@/lib/audit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";

export const dynamic = "force-dynamic";

function summarise(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditTrailPage() {
  const entries = await listAudit();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Voids, deletions, opening balances and year-end closings — who did what, and when"
      />

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead className="w-32">Who</TableHead>
              <TableHead className="w-36">What</TableHead>
              <TableHead className="w-24">Action</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">
                  {format(e.createdAt, "dd MMM yyyy HH:mm")}
                </TableCell>
                <TableCell>{e.userName}</TableCell>
                <TableCell className="text-muted-foreground">{e.entity}</TableCell>
                <TableCell>
                  <Badge variant={e.action === "void" || e.action === "delete" ? "destructive" : "outline"}>
                    {e.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {summarise(e.before) || summarise(e.after) || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {entries.length === 0 && (
          <Empty
            icon={ShieldCheck}
            title="Nothing recorded yet"
            description="Voids, deletions, opening balance changes and year-end closings are logged here as they happen."
          />
        )}
      </DataCard>

      <p className="text-xs text-muted-foreground">
        Ordinary postings are not listed here — every one of those already leaves a journal entry, and
        voiding one posts a reversal rather than deleting anything.
      </p>
    </div>
  );
}
