import Link from "next/link";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JournalEditor } from "../journal-editor";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  const accounts = await db.account.findMany({
    where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Journal Entry"
        actions={
          <Button asChild variant="outline">
            <Link href="/journal">Cancel</Link>
          </Button>
        }
      />
      <JournalEditor accounts={accounts} />
    </div>
  );
}
