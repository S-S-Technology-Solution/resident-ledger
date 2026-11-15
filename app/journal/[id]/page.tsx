import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { journalAccountOptions, RESIDENT_PICK } from "@/lib/journal-residents";
import { Badge } from "@/components/ui/badge";
import { JournalEditor } from "../journal-editor";
import { format } from "date-fns";
import { VoidButton } from "./void-button";
import { PageHeader } from "@/components/page-header";
import { requireScreen } from "@/lib/screen-guard";
import { canSeeScreen } from "@/lib/screens";
import { sourceDocument, SOURCE_LABEL } from "@/lib/entry-source";
import { Button } from "@/components/ui/button";
import { Writable } from "@/components/writable";

export const dynamic = "force-dynamic";

export default async function ViewJournalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireScreen("journal");
  const { id } = await params;
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!entry) notFound();

  const accounts = await journalAccountOptions();
  // Posted by the system for a document (a payment voucher, a receipt …): that
  // document is where it is voided, so its posting goes with it.
  const keyed = entry.source === "manual";
  const source = keyed ? null : sourceDocument(entry);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Entry ${entry.entryNo}`}
        description={
          !keyed && entry.status === "POSTED" ? `Posted from a ${(SOURCE_LABEL[entry.source] ?? entry.source).toLowerCase()} — to undo it, void that.`
          : entry.status === "DRAFT"
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
            {entry.status === "POSTED" && keyed && <Writable><VoidButton id={entry.id} /></Writable>}
            {source && canSeeScreen(user, source.screen) && (
              <Button asChild variant="outline"><Link href={source.href}>{source.label}</Link></Button>
            )}
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
            accountId: l.residentId ? `${RESIDENT_PICK}${l.residentId}` : l.accountId,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
            memo: l.memo ?? "",
          })),
        }}
      />
    </div>
  );
}
