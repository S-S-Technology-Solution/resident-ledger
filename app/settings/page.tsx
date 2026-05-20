import { getAssociation } from "@/lib/association";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const a = await getAssociation();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Association details shown on receipts and reports" />
      <SettingsForm
        initial={{
          name: a.name,
          registrationNo: a.registrationNo ?? "",
          address: a.address ?? "",
          currency: a.currency,
          fiscalYearStart: a.fiscalYearStart,
          lockedThrough: a.lockedThrough ? a.lockedThrough.toISOString().slice(0, 10) : "",
        }}
      />
    </div>
  );
}
