"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickRow = { id: string; href: string; cells: string[] };

/**
 * Choose what a report is for (a resident, supplier or batch) from a table that
 * shows enough to recognise it — code, address, name — with a search box.
 * The chosen row stays highlighted and scrolled into view.
 */
export function PickTable({
  columns,
  rows,
  selected,
  placeholder = "Search…",
  empty = "Nothing to show yet.",
}: {
  columns: string[];
  rows: PickRow[];
  selected?: string;
  placeholder?: string;
  empty?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const chosen = useRef<HTMLTableRowElement>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((r) => {
      const text = r.cells.join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [q, rows]);

  useEffect(() => {
    chosen.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="no-print rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {shown.length === rows.length ? `${rows.length}` : `${shown.length} of ${rows.length}`}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/90 text-left text-xs text-muted-foreground backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-1.5 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const isSel = r.id === selected;
              return (
                <tr
                  key={r.id}
                  ref={isSel ? chosen : undefined}
                  onClick={() => router.push(r.href)}
                  className={cn(
                    "cursor-pointer border-t",
                    isSel ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn("px-3 py-1.5", i === 0 && "font-mono text-xs whitespace-nowrap")}>
                      {i === 0 ? (
                        <a href={r.href} onClick={(e) => e.preventDefault()} className="outline-none">{c}</a>
                      ) : c}
                    </td>
                  ))}
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {rows.length ? "No match" : empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
