import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { Badge } from "@/components/ui/badge";
import { JournalEditor } from "../journal-editor";
import { format } from "date-fns";
import { VoidButton } from "./void-button";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entry {entry.entryNo}</h1>
          <div className="text-sm text-slate-500 flex items-center gap-2">
            {entry.status === "DRAFT" && <Badge variant="outline">Draft</Badge>}
            {entry.status === "POSTED" && <Badge>Posted on {format(entry.postedAt!, "yyyy-MM-dd")}</Badge>}
            {entry.status === "VOIDED" && <Badge variant="destructive">Voided: {entry.voidReason}</Badge>}
          </div>
        </div>
        {entry.status === "POSTED" && <VoidButton id={entry.id} />}
      </div>

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
