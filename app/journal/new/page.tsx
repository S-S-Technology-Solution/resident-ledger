import Link from "next/link";
import { journalAccountOptions } from "@/lib/journal-residents";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JournalEditor } from "../journal-editor";
import { requireWrite } from "@/lib/screen-guard";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  await requireWrite("journal", "/journal");
  const accounts = await journalAccountOptions();
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
