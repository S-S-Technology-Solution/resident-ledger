"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone";

const schema = z.object({
  // Phone number or email address.
  login: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function loginAction(formData: FormData) {
  const parsed = schema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid phone number or password" };

  const login = parsed.data.login;
  const user = login.includes("@")
    ? await db.user.findUnique({ where: { email: login.toLowerCase() } })
    : await db.user.findUnique({ where: { phone: normalisePhone(login) } });
  if (!user) return { error: "Invalid phone number or password" };
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: "Invalid phone number or password" };
  // Checked after the password so a wrong guess cannot reveal that an account exists.
  if (!user.active) return { error: "This account has been deactivated. Ask an administrator." };

  await setSessionCookie(user.id);
  redirect(parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
