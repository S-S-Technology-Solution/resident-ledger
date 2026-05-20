"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (sp.get("print") === "1") {
      // Strip the query param so a refresh doesn't re-trigger print.
      router.replace(pathname);
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [sp, router, pathname]);

  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );
}
