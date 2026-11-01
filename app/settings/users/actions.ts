"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { DEFAULT_ASSOCIATION_ID } from "@/lib/association";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { attempt } from "@/lib/action-server";
import { REPORT_KEYS, SCREEN_KEYS, reportScreen } from "@/lib/screens";
import { isValidPhone, normalisePhone } from "@/lib/phone";

const SCREEN_VALUES = [...SCREEN_KEYS, ...REPORT_KEYS.map(reportScreen)];

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  phone: z.string().transform(normalisePhone)
    .refine((p) => p === "" || isValidPhone(p), "Enter a phone number such as 012-3456789"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional().or(z.literal("")),
  role: z.enum(["ADMIN", "TREASURER", "VIEWER"]),
  password: z.string().min(8, "Use at least 8 characters").optional().or(z.literal("")),
  allScreens: z.boolean().default(true),
  screens: z.array(z.string().refine((k) => SCREEN_VALUES.includes(k), "Unknown screen")).default([]),
}).refine((d) => d.phone || d.email, {
  message: "Enter a phone number or an email address to sign in with.",
}).refine((d) => d.role === "ADMIN" || d.allScreens || d.screens.some((k) => !k.startsWith("report:")), {
  message: "Tick at least one screen, or give access to all screens.",
});

/** Phone and email are sign-in names, so no two users may share one. */
async function checkUnique(phone: string | null, email: string | null, id?: string) {
  const clash = await db.user.findFirst({
    where: { id: id ? { not: id } : undefined, OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
  });
  if (!clash) return;
  throw new Error(phone && clash.phone === phone ? "That phone number is already in use" : "That email address is already in use");
}

/** Ticked reports only count alongside the Reports screen. */
const screensFor = (d: { role: string; allScreens: boolean; screens: string[] }) =>
  d.role === "ADMIN" || d.allScreens ? []
  : d.screens.includes("reports") ? d.screens
  : d.screens.filter((k) => !k.startsWith("report:"));

export async function upsertUser(input: z.infer<typeof schema>) {
  return attempt(async () => {
    const admin = await requireAdmin();
    const data = schema.parse(input);
    const phone = data.phone || null;
    const email = data.email || null;
    const screens = screensFor(data);
    await checkUnique(phone, email, data.id);

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
          phone,
          email,
          role: data.role,
          allScreens: data.role === "ADMIN" || data.allScreens,
          screens,
          ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
        },
      });
      await recordAudit("user", data.id, "update", {
        before: { phone: existing.phone, email: existing.email, role: existing.role, allScreens: existing.allScreens, screens: existing.screens },
        after: {
          phone, email, role: data.role, passwordChanged: Boolean(data.password),
          allScreens: data.role === "ADMIN" || data.allScreens, screens,
        },
      });
    } else {
      if (!data.password) throw new Error("Set a password for the new user");

      const created = await db.user.create({
        data: {
          associationId: DEFAULT_ASSOCIATION_ID,
          name: data.name,
          phone,
          email,
          role: data.role,
          allScreens: data.role === "ADMIN" || data.allScreens,
          screens,
          passwordHash: await bcrypt.hash(data.password, 10),
        },
      });
      await recordAudit("user", created.id, "create", {
        after: { phone, email, role: data.role, allScreens: data.allScreens, screens, createdBy: admin.email ?? admin.phone },
      });
    }

    revalidatePath("/settings/users");
  });
}

export async function setUserActive(id: string, active: boolean) {
  return attempt(async () => {
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
      before: { phone: user.phone, email: user.email },
    });
    revalidatePath("/settings/users");
  });
}
