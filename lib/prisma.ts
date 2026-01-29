// 职责说明：提供 PrismaClient 单例，供 Next API Routes 访问数据库。
// 调用链：Next API Routes -> lib/prisma -> Prisma Client -> PostgreSQL

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
