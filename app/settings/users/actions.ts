"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email address"),
  role: z.enum(["ADMIN", "TREASURER", "VIEWER"]),
  password: z.string().min(8, "Use at least 8 characters").optional().or(z.literal("")),
});

export async function upsertUser(input: z.infer<typeof schema>) {
  const admin = await requireAdmin();
  const data = schema.parse(input);

  if (data.id) {
    const existing = await db.user.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("User not found");

    // Never let the last administrator demote themselves out of the role.
    if (existing.role === "ADMIN" && data.role !== "ADMIN") {
      const admins = await db.user.count({
        where: { associationId: DEFAULT_ASSOCIATION_ID, role: "ADMIN", active: true },
      });
      if (admins <= 1) {
        throw new Error("This is the only administrator — promote someone else first.");
      }
    }

    await db.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
      },
    });
    await recordAudit("user", data.id, "update", {
      before: { email: existing.email, role: existing.role },
      after: { email: data.email, role: data.role, passwordChanged: Boolean(data.password) },
    });
  } else {
    if (!data.password) throw new Error("Set a password for the new user");
    const clash = await db.user.findUnique({ where: { email: data.email } });
    if (clash) throw new Error("That email address is already in use");

    const created = await db.user.create({
      data: {
        associationId: DEFAULT_ASSOCIATION_ID,
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash: await bcrypt.hash(data.password, 10),
      },
    });
    await recordAudit("user", created.id, "create", {
      after: { email: data.email, role: data.role, createdBy: admin.email },
    });
  }

  revalidatePath("/settings/users");
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (id === admin.id && !active) throw new Error("You cannot deactivate your own account.");

  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!active && user.role === "ADMIN") {
    const admins = await db.user.count({
      where: { associationId: DEFAULT_ASSOCIATION_ID, role: "ADMIN", active: true },
    });
    if (admins <= 1) throw new Error("This is the only administrator — promote someone else first.");
  }

  await db.user.update({ where: { id }, data: { active } });
  await recordAudit("user", id, active ? "reactivate" : "deactivate", {
    before: { email: user.email },
  });
  revalidatePath("/settings/users");
}
