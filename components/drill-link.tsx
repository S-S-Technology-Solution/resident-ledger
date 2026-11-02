import Link from "next/link";
import { cn } from "@/lib/utils";

/** A figure or name on a report that opens what makes it up. */
export function DrillLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("decoration-primary/40 underline-offset-2 hover:text-primary hover:underline", className)}>
      {children}
    </Link>
  );
}
