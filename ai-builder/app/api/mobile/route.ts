import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { canWrite, getRole } from "@/lib/access";
import { queue } from "@/lib/queue";
import { checkUsage, recordUsage } from "@/lib/usage";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (!(await getRole(projectId, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const releases = await db.release.findMany({
    where: { projectId }, orderBy: { createdAt: "desc" }, take: 10,
    select: { id: true, platform: true, kind: true, status: true, url: true, logs: true, createdAt: true },
  });
  return NextResponse.json({ releases });
}

const Body = z.object({
  projectId: z.string(),
  kind: z.enum(["build", "update"]),
  platform: z.enum(["android", "ios", "all"]).default("android"),
});

// Mobile: EAS builds (paid feature) and Expo Go updates (QR-code preview)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { projectId, kind, platform } = parsed.data;
  if (!canWrite(await getRole(projectId, user.id))) return NextResponse.json({ error: "No edit access" }, { status: 403 });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { framework: true } });
  if (project?.framework !== "expo") return NextResponse.json({ error: "Only Expo projects can use mobile builds" }, { status: 400 });

  const u = await checkUsage(user.id, user.plan, kind);
  if (!u.ok)
    return NextResponse.json(
      { error: kind === "build" ? "Android/iOS cloud builds are a paid feature. Upgrade on the Billing page." : "Daily limit reached" },
      { status: 402 }
    );

  try {
    const rel = await db.release.create({ data: { projectId, kind, platform: kind === "update" ? "all" : platform, status: "queued" } });
    await queue().add("mobile", { type: "mobile", releaseId: rel.id });
    await recordUsage(user.id, kind);
    audit(user.id, `mobile.${kind}`, projectId, platform);
    return NextResponse.json({ id: rel.id });
  } catch {
    return NextResponse.json({ error: "Could not queue the job. Is Redis running?" }, { status: 503 });
  }
}
