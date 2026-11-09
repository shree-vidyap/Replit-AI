import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { getRole } from "@/lib/access";
import { audit } from "@/lib/audit";

// Project sharing / team collaboration — owner invites registered users as viewer or editor
async function owner(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((await getRole(projectId, user.id)) !== "owner")
    return { error: NextResponse.json({ error: "Only the owner can manage sharing" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const o = await owner(projectId);
  if (o.error) return o.error;
  const members = await db.projectMember.findMany({
    where: { projectId },
    select: { userId: true, role: true, user: { select: { email: true } } },
  });
  return NextResponse.json({ members: members.map((m: any) => ({ userId: m.userId, role: m.role, email: m.user.email })) });
}

const Add = z.object({ projectId: z.string(), email: z.string().email(), role: z.enum(["viewer", "editor"]) });

export async function POST(req: NextRequest) {
  const parsed = Add.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const o = await owner(parsed.data.projectId);
  if (o.error) return o.error;
  const target = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!target) return NextResponse.json({ error: "That person has not registered yet" }, { status: 404 });
  if (target.id === o.user!.id) return NextResponse.json({ error: "You already own this project" }, { status: 400 });
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: parsed.data.projectId, userId: target.id } },
    update: { role: parsed.data.role },
    create: { projectId: parsed.data.projectId, userId: target.id, role: parsed.data.role },
  });
  audit(o.user!.id, "share.add", parsed.data.projectId, `${parsed.data.email} as ${parsed.data.role}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { projectId, userId } = await req.json();
  const o = await owner(projectId);
  if (o.error) return o.error;
  await db.projectMember.deleteMany({ where: { projectId, userId } });
  audit(o.user!.id, "share.remove", projectId, userId);
  return NextResponse.json({ ok: true });
}
