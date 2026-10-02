import { currentUser } from "@/lib/screen-guard";
import { canPost } from "@/lib/permissions";

/**
 * Shows its contents only to users who may post (administrators and
 * treasurers). View-only users see the same screens without the buttons that
 * would change anything — the server refuses those actions anyway, but a button
 * that can only fail shouldn't be offered.
 */
export async function Writable({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return user && canPost(user.role) ? <>{children}</> : null;
}
