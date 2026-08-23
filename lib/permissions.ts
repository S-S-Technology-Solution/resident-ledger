import { UserRole } from "@prisma/client";
import { db } from "./db";
import { currentSession } from "./auth";

/**
 * Role gate.
 *
 *   ADMIN     — everything, including users, settings, year-end, opening balances
 *   TREASURER — day-to-day posting: invoices, receipts, bills, payments, journals
 *   VIEWER    — read-only
 *
 * Server actions call `requirePosting()` or `requireAdmin()`. Read paths are not
 * gated: a viewer who reaches a page still only sees what the page renders, and
 * every mutation goes through an action that checks.
 */

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await currentSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return user ?? null;
}

export function canPost(role: UserRole) {
  return role === "ADMIN" || role === "TREASURER";
}

export function canAdminister(role: UserRole) {
  return role === "ADMIN";
}

/** Throws unless the signed-in user may post transactions. */
export async function requirePosting() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You are not signed in.");
  if (!user.active) throw new Error("This account has been deactivated.");
  if (!canPost(user.role)) {
    throw new Error("Your account has view-only access — you cannot post transactions.");
  }
  return user;
}

/** Throws unless the signed-in user is an administrator. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You are not signed in.");
  if (!user.active) throw new Error("This account has been deactivated.");
  if (!canAdminister(user.role)) {
    throw new Error("Only an administrator can do this.");
  }
  return user;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TREASURER: "Treasurer",
  VIEWER: "View only",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  ADMIN: "Everything, including users, settings, year-end closing and opening balances",
  TREASURER: "Day-to-day posting — invoices, receipts, bills, payments and journals",
  VIEWER: "Read-only access to reports and listings",
};
