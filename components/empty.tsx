import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Empty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
