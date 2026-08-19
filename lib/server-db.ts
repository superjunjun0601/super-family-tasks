import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  __superFamilyPrisma?: PrismaClient;
};

export const hasDatabaseConfig = () =>
  Boolean(process.env.DATABASE_URL && (process.env.NODE_ENV === "production" || process.env.STORAGE_MODE === "postgres"));

export const prisma =
  globalForPrisma.__superFamilyPrisma ??
  new PrismaClient({
    log: ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__superFamilyPrisma = prisma;
}
