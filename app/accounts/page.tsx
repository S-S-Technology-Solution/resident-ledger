import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen } from "lucide-react";
import { AccountDialog } from "./account-dialog";
import { ToggleButton } from "./toggle-button";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function acTypeLabel(t: string) {
  return t === "INCOME" || t === "EXPENSE" ? "P&L" : "Balance Sheet";
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const accounts = await db.account.findMany({
    where: {
      associationId: DEFAULT_ASSOCIATION_ID,
      ...(type ? { type: type as "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" } : {}),
    },
    include: { parent: true },
    orderBy: { code: "asc" },
  });

  const types = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description={`${accounts.length} accounts`}
        actions={<AccountDialog mode="create" />}
      />

      <nav className="flex items-center gap-1 text-sm border-b">
        <Link href="/accounts" className={cn("px-3 py-2 -mb-px border-b-2", !type ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>All</Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/accounts?type=${t}`}
            className={cn("px-3 py-2 -mb-px border-b-2 uppercase text-xs tracking-wide", type === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t}
          </Link>
        ))}
      </nav>

      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">A/C No.</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28">A/C Type</TableHead>
              <TableHead className="w-36">A/C Group</TableHead>
              <TableHead className="w-24">Classified As</TableHead>
              <TableHead className="w-28">Group To A/C</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-36 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.code}</TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-xs">{acTypeLabel(a.type)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.group || "—"}</TableCell>
                <TableCell className="text-xs font-mono">{a.classifiedAs ?? ""}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.parent?.code ?? a.code}</TableCell>
                <TableCell>
                  {a.active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <AccountDialog mode="edit" account={{
                    id: a.id, code: a.code, name: a.name, type: a.type, normalSide: a.normalSide,
                    group: a.group, classifiedAs: a.classifiedAs,
                  }} />
                  <ToggleButton id={a.id} active={a.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {accounts.length === 0 && (
          <Empty
            icon={BookOpen}
            title={type ? `No ${type.toLowerCase()} accounts` : "No accounts yet"}
            description={type ? "Switch filter or add one for this type." : "Add the first account to start posting journal entries."}
            action={!type && <AccountDialog mode="create" />}
          />
        )}
      </DataCard>
    </div>
  );
}
