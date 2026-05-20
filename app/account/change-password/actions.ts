"use server";

import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";

export async function changePassword({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  const session = await currentSession();
  if (!session) return { error: "Not signed in." };
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "User not found." };
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { ok: true };
}
