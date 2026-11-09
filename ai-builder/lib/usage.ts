import { db } from "./prisma";

export type UsageKind = "ai" | "deploy" | "sandbox" | "build" | "update";

// Daily usage limits per plan (PDF: usage limits; mobile builds are a paid feature)
export const LIMITS: Record<string, Record<UsageKind, number>> = {
  free: { ai: 30, deploy: 3, sandbox: 50, build: 0, update: 5 },
  pro: { ai: 1000, deploy: 100, sandbox: 1000, build: 50, update: 200 },
};

const DAY = 24 * 60 * 60 * 1000;

export async function checkUsage(userId: string, plan: string, kind: UsageKind) {
  const limit = (LIMITS[plan] ?? LIMITS.free)[kind];
  const used = await db.usageEvent.count({
    where: { userId, kind, createdAt: { gte: new Date(Date.now() - DAY) } },
  });
  return { ok: used < limit, used, limit };
}

export async function recordUsage(userId: string, kind: UsageKind) {
  await db.usageEvent.create({ data: { userId, kind } });
}
