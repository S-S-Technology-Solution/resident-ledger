import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import {
  controlAccountCodes, CONTROL_KEYS, CONTROL_LABEL, CONTROL_DESCRIPTION,
} from "@/lib/control-accounts";
import { getAllSequenceConfigs } from "@/lib/numbering";
import { getCurrentUser } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ControlAccountsForm, SequenceForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function DefaultsPage() {
  const [codes, sequences, accounts, me] = await Promise.all([
    controlAccountCodes(),
    getAllSequenceConfigs(),
    db.account.findMany({
      where: { associationId: DEFAULT_ASSOCIATION_ID, active: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    getCurrentUser(),
  ]);

  const readOnly = me?.role !== "ADMIN";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Control Accounts & Numbering"
        description="Which accounts the system posts to automatically, and how documents are numbered"
      />

      {readOnly && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an administrator can change these. You can see the current settings here.
        </p>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Control accounts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These are posted to automatically. An account cannot be deleted while a control account
            points at it.
          </p>
        </div>
        <ControlAccountsForm
          readOnly={readOnly}
          accounts={accounts}
          rows={CONTROL_KEYS.map((k) => ({
            key: k,
            label: CONTROL_LABEL[k],
            description: CONTROL_DESCRIPTION[k],
            code: codes[k],
          }))}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Document numbering
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The prefix and width used when each kind of document is issued.
          </p>
        </div>
        <SequenceForm readOnly={readOnly} rows={sequences} />
      </section>
    </div>
  );
}
