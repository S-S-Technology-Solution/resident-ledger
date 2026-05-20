import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyRound, Settings } from "lucide-react";
import Link from "next/link";
import { SignOutItem } from "./sign-out-item";

export async function UserMenu() {
  const session = await currentSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="grid h-9 w-9 place-items-center rounded-full bg-emerald-700 text-emerald-50 text-sm font-semibold hover:opacity-90"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-medium">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="h-4 w-4" />Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/change-password"><KeyRound className="h-4 w-4" />Change password</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
