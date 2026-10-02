import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { canPost, getCurrentUser } from "./permissions";
import { canSeeScreen, homeFor, type ScreenKey } from "./screens";

/** The signed-in user, read once per request however many components ask. */
export const currentUser = cache(getCurrentUser);

/**
 * Called at the top of every page. Sends a signed-out visitor to sign in, and a
 * user without access to this screen to their first permitted screen (or the
 * no-access page). This is the real check — the menu only hides what a user
 * can't open; it doesn't stop them typing the address.
 */
export async function requireScreen(key: ScreenKey) {
  const user = await currentUser();
  if (!user || !user.active) redirect("/login");
  if (canSeeScreen(user, key)) return user;
  if (key === "dashboard") redirect(homeFor(user));
  redirect(`/no-access?screen=${key}`);
}

/** For "new …" pages: view-only users are sent back to the list instead. */
export async function requireWrite(key: ScreenKey, back: string) {
  const user = await requireScreen(key);
  if (!canPost(user.role)) redirect(back);
  return user;
}
