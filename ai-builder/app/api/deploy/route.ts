import { NextRequest, NextResponse } from "next/server";
import { db, getCurrentUser } from "@/lib/db";
import { canWrite, getRole } from "@/lib/access";
import { queue } from "@/lib/queue";
import { checkUsage, recordUsage } from "@/lib/usage";
import { audit } from "@/lib/audit";
import { metrics } from "@/lib/metrics";
import { siteUrl } from "@/lib/sites";
import { STATIC_DEPLOYABLE } from "@/lib/templates";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (!(await getRole(projectId, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true, liveDeploymentId: true } });
  const deployments = await db.deployment.findMany({
    where: { projectId }, orderBy: { createdAt: "desc" }, take: 8,
    select: { id: true, status: true, logs: true, createdAt: true },
  });
  return NextResponse.json({
    deployments,
    liveUrl: project?.liveDeploymentId ? siteUrl(project.slug) : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await req.json();
  if (!canWrite(await getRole(projectId, user.id))) return NextResponse.json({ error: "No edit access" }, { status: 403 });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { framework: true } });
  if (!project || !STATIC_DEPLOYABLE.includes(project.framework))
    return NextResponse.json({ error: "Deploy currently supports React (Vite) projects." }, { status: 400 });

  const u = await checkUsage(user.id, user.plan, "deploy");
  if (!u.ok) return NextResponse.json({ error: `Daily deploy limit reached (${u.limit})` }, { status: 402 });

  try {
    const dep = await db.deployment.create({ data: { projectId, status: "queued" } });
    await queue().add("deploy", { type: "deploy", deploymentId: dep.id });
    await recordUsage(user.id, "deploy");
    metrics.deploys.inc();
    audit(user.id, "deploy.start", projectId, dep.id);
    return NextResponse.json({ id: dep.id });
  } catch {
    return NextResponse.json({ error: "Could not queue the job. Is Redis running (docker compose up -d)?" }, { status: 503 });
  }
}
