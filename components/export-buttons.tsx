"use client";

import { FileDown, Sheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButtons({
  slug,
  params = {},
}: {
  slug: string;
  params?: Record<string, string | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const make = (fmt: "pdf" | "xlsx") => {
    const q = new URLSearchParams(qs);
    q.set("format", fmt);
    return `/api/export/${slug}?${q.toString()}`;
  };
  return (
    <div className="flex items-center gap-2 no-print">
      <Button asChild variant="outline" size="sm">
        <a href={make("pdf")} target="_blank" rel="noopener noreferrer">
          <FileDown className="h-4 w-4" />
          PDF
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={make("xlsx")}>
          <Sheet className="h-4 w-4" />
          Excel
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print
      </Button>
    </div>
  );
}
