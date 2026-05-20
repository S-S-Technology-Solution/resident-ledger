import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
