"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useCanExport } from "@/components/export-access";

export function PrintButton() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = useCanExport();

  useEffect(() => {
    if (sp.get("print") === "1") {
      // Strip the query param so a refresh doesn't re-trigger print.
      router.replace(pathname);
      if (!allowed) return;
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [sp, router, pathname, allowed]);

  if (!allowed) return null;

  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );
}
