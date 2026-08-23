import { db } from "./db";
import { currentSession } from "./auth";

/**
 * Records who changed what. Aimed at the actions that are hard to see after the
 * fact — voids, deletions, year-end closing, opening balances — rather than every
 * write, since ordinary postings already leave a journal entry behind them.
 */
export async function recordAudit(
  entity: string,
  entityId: string,
  action: string,
  detail?: { before?: unknown; after?: unknown },
) {
  try {
    const session = await currentSession();
    await db.auditLog.create({
      data: {
        userId: session?.userId ?? null,
        entity,
        entityId,
        action,
        before: (detail?.before ?? undefined) as never,
        after: (detail?.after ?? undefined) as never,
      },
    });
  } catch {
    // Auditing must never be the reason a legitimate action fails.
  }
}

export async function listAudit(limit = 200) {
  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));

  return entries.map((e) => ({ ...e, userName: e.userId ? byId.get(e.userId) ?? "Unknown" : "System" }));
}
