import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { Badge } from "@/components/ui/badge";
import { JournalEditor } from "../journal-editor";
import { format } from "date-fns";
import { VoidButton } from "./void-button";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ViewJournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!entry) notFound();

  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Entry ${entry.entryNo}`}
        description={
          entry.status === "DRAFT"
            ? "Draft — not yet posted"
            : entry.status === "POSTED"
              ? `Posted on ${format(entry.postedAt!, "dd MMM yyyy")}`
              : `Voided: ${entry.voidReason ?? "—"}`
        }
        actions={
          <div className="flex items-center gap-2">
            {entry.status === "DRAFT" && <Badge variant="outline">Draft</Badge>}
            {entry.status === "POSTED" && <Badge>Posted</Badge>}
            {entry.status === "VOIDED" && <Badge variant="destructive">Voided</Badge>}
            {entry.status === "POSTED" && <VoidButton id={entry.id} />}
          </div>
        }
      />

      <JournalEditor
        accounts={accounts}
        initial={{
          id: entry.id,
          entryNo: entry.entryNo,
          date: entry.date.toISOString().slice(0, 10),
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          lines: entry.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
            memo: l.memo ?? "",
          })),
        }}
      />
    </div>
  );
}
