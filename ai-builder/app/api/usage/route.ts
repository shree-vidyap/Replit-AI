import { NextResponse } from "next/server";
import { db, getCurrentUser } from "@/lib/db";
import { LIMITS } from "@/lib/usage";

// Usage analytics: today's usage vs plan limits + last 30 days
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const events = await db.usageEvent.findMany({
    where: { userId: user.id, createdAt: { gte: since30 } },
    select: { kind: true, createdAt: true },
    take: 5000,
  });
  const dayAgo = Date.now() - 86_400_000;
  const today: Record<string, number> = {};
  const total30: Record<string, number> = {};
  for (const e of events) {
    total30[e.kind] = (total30[e.kind] ?? 0) + 1;
    if (e.createdAt.getTime() >= dayAgo) today[e.kind] = (today[e.kind] ?? 0) + 1;
  }
  return NextResponse.json({ plan: user.plan, limits: LIMITS[user.plan] ?? LIMITS.free, today, total30 });
}
