import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { getTemplate, TEMPLATES } from "@/lib/templates";
import { slugify } from "@/lib/sites";
import { audit } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const projects = await db.project.findMany({
      where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, framework: true, updatedAt: true, ownerId: true },
    });
    return NextResponse.json({
      projects: projects.map((p: any) => ({ ...p, shared: p.ownerId !== user.id })),
    });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

const Body = z.object({ name: z.string().min(1).max(80), framework: z.string() });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success || !TEMPLATES[parsed.data.framework])
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const files = getTemplate(parsed.data.framework);
    const project = await db.project.create({
      data: {
        name: parsed.data.name,
        framework: parsed.data.framework,
        slug: slugify(parsed.data.name),
        ownerId: user.id,
        files: { create: Object.entries(files).map(([path, content]) => ({ path, content })) },
        versions: { create: { message: "Initial template", snapshot: files } },
      },
    });
    audit(user.id, "project.create", project.id, project.name);
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
