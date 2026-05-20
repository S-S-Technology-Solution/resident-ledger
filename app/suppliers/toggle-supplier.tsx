"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { toggleSupplier } from "./actions";

export function ToggleSupplier({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  if (active) {
    return (
      <ConfirmButton
        label="Deactivate"
        title="Deactivate this supplier?"
        description="They won't appear in the new-bill picker. Existing bills are unaffected."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          await toggleSupplier(id, false);
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
        try { await toggleSupplier(id, true); toast.success("Activated"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
      })}
    >Activate</Button>
  );
}
