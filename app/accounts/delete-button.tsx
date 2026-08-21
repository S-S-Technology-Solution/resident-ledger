"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { deleteAccount } from "./actions";

export function DeleteButton({ id, code }: { id: string; code: string }) {
  return (
    <ConfirmButton
      label="Delete"
      title={`Delete account ${code}?`}
      description="This permanently removes the account. Blocked if it has been used in any journal entry, has child accounts, or is referenced by a bill."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        await deleteAccount(id);
        toast.success("Deleted");
      }}
    />
  );
}
