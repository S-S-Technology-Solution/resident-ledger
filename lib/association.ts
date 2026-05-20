import { db } from "./db";

export const DEFAULT_ASSOCIATION_ID = "default";

export async function getAssociation() {
  const a = await db.association.findUnique({ where: { id: DEFAULT_ASSOCIATION_ID } });
  if (!a) throw new Error("Association not seeded. Run `npm run db:seed`.");
  return a;
}
