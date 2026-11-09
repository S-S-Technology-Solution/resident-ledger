"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCREENS, screenForPath } from "@/lib/screens";

const ROOTS = new Set([...SCREENS.map((s) => s.href), "/no-access", "/login"]);

// The first page this tab loaded, and whether we have moved on from it inside
// the app. document.referrer only changes on a full page load, so a click
// through a link (trial balance → ledger) would not show up there.
let firstPath: string | null = null;
let movedInApp = false;

/**
 * "← Back" above every page that isn't a menu item's main list — a receipt, a
 * form, a voucher, a report. Goes back to the page it came from (a ledger
 * opened from the trial balance returns to the trial balance); a page opened
 * directly (a bookmark, a new tab) goes to its section.
 */
export function BackButton() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (firstPath === null) firstPath = path;
    else if (path !== firstPath) movedInApp = true;
  }, [path]);
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
          const cameFromApp = movedInApp || document.referrer.startsWith(window.location.origin);
          if (window.history.length > 1 && cameFromApp) router.back();
          else router.push(section);
        }}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
    </div>
  );
}
