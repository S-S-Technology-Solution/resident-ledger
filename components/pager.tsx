import Link from "next/link";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 100;

/** Page number from a `?page=` value; anything missing or invalid is page 1. */
export function pageFrom(value: string | undefined) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/**
 * "Showing 101–200 of 1,688" with Previous / Next links. Keeps the page's other
 * search parameters (filters) so paging never drops a filter.
 */
export function Pager({
  path,
  params,
  page,
  total,
  pageSize = PAGE_SIZE,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t text-sm">
      <span className="text-muted-foreground tabular">
        {total === 0 ? "Nothing to show" : `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Previous</Link></Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Previous</Button>
          )}
          <span className="text-muted-foreground tabular">Page {page} of {pages}</span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Next</Link></Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Next</Button>
          )}
        </div>
      )}
    </div>
  );
}
