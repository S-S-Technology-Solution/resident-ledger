import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-6 border-b px-4 py-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="grid grid-cols-6 px-4 py-3 gap-4 border-b last:border-0">
            {Array.from({ length: 6 }).map((_, c) => (
              <Skeleton key={c} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
