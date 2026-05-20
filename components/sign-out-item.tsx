"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/login/actions";
import { toast } from "sonner";

export function SignOutItem() {
  const [pending, start] = useTransition();
  return (
    <DropdownMenuItem
      disabled={pending}
      onSelect={(e) => {
        e.preventDefault(); // don't let Radix close the menu before the action fires
        start(async () => {
          try {
            await logoutAction();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Sign out failed");
          }
        });
      }}
    >
      <LogOut className="h-4 w-4" />
      {pending ? "Signing out…" : "Sign out"}
    </DropdownMenuItem>
  );
}
