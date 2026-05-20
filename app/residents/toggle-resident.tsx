"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { toggleResident } from "./actions";

export function ToggleResident({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  if (active) {
    return (
      <ConfirmButton
        label="Move out"
        title="Mark resident as moved out?"
        description="They'll be hidden from the active list and bulk-charge runs. You can reactivate later."
        confirmLabel="Move out"
        destructive
        onConfirm={async () => {
          await toggleResident(id, false);
          toast.success("Marked moved out");
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
        try { await toggleResident(id, true); toast.success("Reactivated"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
      })}
    >Reactivate</Button>
  );
}
