import { cn } from "@/lib/utils";

export function DataCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rl-table rounded-xl border bg-card overflow-x-auto text-sm", className)}>
      {children}
    </div>
  );
}
