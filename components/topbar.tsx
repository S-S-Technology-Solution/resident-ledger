import { MobileMenuButton } from "./sidebar-nav";
import { getAssociation } from "@/lib/association";
import { UserMenu } from "./user-menu";

export async function Topbar() {
  const association = await getAssociation();
  return (
    <header className="flex items-center gap-3 border-b bg-card/80 backdrop-blur px-4 py-3 lg:px-6 no-print sticky top-0 z-30">
      <MobileMenuButton />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{association.name}</div>
        <div className="hidden sm:block text-xs text-muted-foreground">
          FY starts {new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2025, association.fiscalYearStart - 1, 1))} · Currency {association.currency}
        </div>
      </div>
      <UserMenu />
    </header>
  );
}
