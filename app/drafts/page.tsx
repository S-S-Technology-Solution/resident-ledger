import { FilePen } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { DataCard } from "@/components/data-card";
import { Empty } from "@/components/empty";
import { requireScreen, currentUser } from "@/lib/screen-guard";
import { canPost } from "@/lib/permissions";
import { draftsRequired } from "@/lib/drafts";
import { DraftList } from "./draft-list";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  await requireScreen("drafts");
  const [drafts, users, on, me] = await Promise.all([
    db.draft.findMany({ where: { associationId: DEFAULT_ASSOCIATION_ID }, orderBy: [{ date: "asc" }, { number: "asc" }] }),
    db.user.findMany({ select: { id: true, name: true } }),
    draftsRequired(),
    currentUser(),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Drafts to post"
        description={on
          ? "Receipts and payments keyed in but not yet in the accounts. Check each entry and amount, then post."
          : "Checking before posting is switched off in Settings, so new receipts and payments post straight away. Drafts already here still need posting."}
      />
      <DataCard>
        {drafts.length === 0 ? (
          <Empty icon={FilePen} title="Nothing waiting" description="Every receipt and payment keyed in has been posted." />
        ) : (
          <DraftList
            canPost={!!me && canPost(me.role)}
            drafts={drafts.map((d) => ({
              id: d.id, kind: d.kind, direction: d.direction, number: d.number, date: d.date.toISOString().slice(0, 10),
              party: d.party, amount: Number(d.amount), keyedBy: d.createdBy ? name.get(d.createdBy) ?? "" : "",
            }))}
          />
        )}
      </DataCard>
    </div>
  );
}
