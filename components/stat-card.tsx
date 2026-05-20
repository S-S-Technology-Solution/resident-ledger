import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "warn";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    default: "text-foreground",
    good: "text-emerald-700",
    bad: "text-destructive",
    warn: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/70" />}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular", toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
