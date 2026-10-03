"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import {
  autoMatchStatement, deleteBankStatement, reopenBankStatement, signOffStatement,
} from "../actions";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
const orThrow = async <T,>(p: Promise<Result<T>>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

export function StatementActions({
  statementId, reconciled, canSignOff, unmatched,
}: {
  statementId: string;
  reconciled: boolean;
  canSignOff: boolean;
  unmatched: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = <T,>(fn: () => Promise<Result<T>>, message: (d: T | undefined) => string) =>
    start(async () => {
      try { toast.success(message(await orThrow(fn()))); } catch (e) { toast.error((e as Error).message); }
    });

  if (reconciled) {
    return (
      <ConfirmButton
        label="Reopen"
        title="Reopen this statement?"
        description="Its lines can be changed again and the lock date moves back so the month is open for posting. Sign it off once more when it agrees."
        confirmLabel="Reopen"
        onConfirm={() => orThrow(reopenBankStatement(statementId))}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {unmatched > 0 && (
        <Button variant="outline" disabled={pending}
          onClick={() => run(() => autoMatchStatement(statementId), (n) => `${n ?? 0} line(s) matched`)}>
          Match automatically
        </Button>
      )}
      <ConfirmButton
        label="Sign off reconciliation"
        variant="default"
        title="Sign off this reconciliation?"
        description={canSignOff
          ? "Bank and book agree. The statement's lines are frozen and the month is locked for posting (Settings › lock date) until it is reopened."
          : "It can't be signed off yet — every line must be matched and bank and book must agree."}
        confirmLabel="Sign off"
        onConfirm={() => orThrow(signOffStatement(statementId))}
      />
      <ConfirmButton
        label="Delete"
        destructive
        title="Delete this statement?"
        description="The uploaded lines are removed and any receipts or payments paired with them go back to uncleared. The book entries themselves stay."
        confirmLabel="Delete statement"
        onConfirm={async () => { await orThrow(deleteBankStatement(statementId)); router.push("/bank-statements"); }}
      />
    </div>
  );
}
