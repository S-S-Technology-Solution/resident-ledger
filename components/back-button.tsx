"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCREENS, screenForPath } from "@/lib/screens";

const ROOTS = new Set([...SCREENS.map((s) => s.href), "/no-access", "/login"]);

/**
 * "← Back" above every page that isn't a menu item's main list — a receipt, a
 * form, a voucher, a report. Goes back in the browser history when there is
 * one; a page opened directly (a bookmark, a new tab) goes to its section.
 */
export function BackButton() {
  const path = usePathname();
  const router = useRouter();
  if (ROOTS.has(path)) return null;
  const section = SCREENS.find((s) => s.key === screenForPath(path))?.href ?? "/";

  return (
    <div className="no-print mb-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={() => {
          if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
          else router.push(section);
        }}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
    </div>
  );
}
