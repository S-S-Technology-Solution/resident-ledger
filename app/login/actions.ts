"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function loginAction(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return { error: "Invalid email or password" };
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: "Invalid email or password" };
  // Checked after the password so a wrong guess cannot reveal that an account exists.
  if (!user.active) return { error: "This account has been deactivated. Ask an administrator." };

  await setSessionCookie(user.id);
  redirect(parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
