"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { toggleAccount } from "./actions";

export function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  if (active) {
    return (
      <ConfirmButton
        label="Deactivate"
        title="Deactivate this account?"
        description="Hides it from new-entry pickers. Blocked if it has been used in any journal entry."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          await toggleAccount(id, false);
          toast.success("Deactivated");
        }}
      />
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => {
        try { await toggleAccount(id, true); toast.success("Activated"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
      })}
    >Activate</Button>
  );
}
