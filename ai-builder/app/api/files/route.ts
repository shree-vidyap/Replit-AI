import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { canWrite, getRole } from "@/lib/access";
import { audit } from "@/lib/audit";
import { isSafePath, type FileMap } from "@/lib/files";

// Load files + version list (owner, editor or viewer)
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  try {
    const role = await getRole(projectId, user.id);
    if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { framework: true, summary: true, name: true, slug: true, liveDeploymentId: true },
    });
    const rows = await db.projectFile.findMany({ where: { projectId } });
    const versions = await db.version.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, message: true, createdAt: true },
      take: 50,
    });
    const files: FileMap = Object.fromEntries(rows.map((r: { path: string; content: string }) => [r.path, r.content]));
    return NextResponse.json({ files, versions, role, ...project });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

const Save = z.object({
  projectId: z.string(),
  files: z.record(z.string()),
  message: z.string().max(200).default("Manual save"),
});

// Save all files + create a Version checkpoint
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Save.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { projectId, files, message } = parsed.data;
  if (!Object.keys(files).every(isSafePath)) return NextResponse.json({ error: "Unsafe path" }, { status: 400 });
  try {
    if (!canWrite(await getRole(projectId, user.id))) return NextResponse.json({ error: "No edit access" }, { status: 403 });
    await db.$transaction([
      db.projectFile.deleteMany({ where: { projectId } }),
      db.projectFile.createMany({ data: Object.entries(files).map(([path, content]) => ({ projectId, path, content })) }),
      db.version.create({ data: { projectId, message, snapshot: files } }),
      db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }),
    ]);
    if (message.startsWith("AI:")) audit(user.id, "ai.apply", projectId, message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// Restore a version
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, versionId } = await req.json();
  try {
    if (!canWrite(await getRole(projectId, user.id))) return NextResponse.json({ error: "No edit access" }, { status: 403 });
    const v = await db.version.findFirst({ where: { id: versionId, projectId } });
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    audit(user.id, "version.restore", projectId, v.message);
    return NextResponse.json({ files: v.snapshot as FileMap });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
