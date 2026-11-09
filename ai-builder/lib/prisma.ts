import { PrismaClient } from "@prisma/client";

export const db: PrismaClient = (globalThis as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (globalThis as any).prisma = db;
