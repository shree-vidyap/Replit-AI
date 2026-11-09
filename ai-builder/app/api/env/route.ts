import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { getRole } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

// Encrypted environment variables. Values are never returned and never sent to the AI.
async function owner(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((await getRole(projectId, user.id)) !== "owner")
    return { error: NextResponse.json({ error: "Only the owner can manage variables" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const o = await owner(projectId);
  if (o.error) return o.error;
  const rows = await db.envVar.findMany({ where: { projectId }, select: { name: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ names: rows.map((r: { name: string }) => r.name) });
}

const Put = z.object({
  projectId: z.string(),
  name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE").max(60),
  value: z.string().min(1).max(4000),
});

export async function PUT(req: NextRequest) {
  const parsed = Put.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const o = await owner(parsed.data.projectId);
  if (o.error) return o.error;
  try {
    const valueEnc = encrypt(parsed.data.value);
    await db.envVar.upsert({
      where: { projectId_name: { projectId: parsed.data.projectId, name: parsed.data.name } },
      update: { valueEnc },
      create: { projectId: parsed.data.projectId, name: parsed.data.name, valueEnc },
    });
  } catch {
    return NextResponse.json({ error: "ENCRYPTION_KEY is not set" }, { status: 500 });
  }
  audit(o.user!.id, "env.set", parsed.data.projectId, parsed.data.name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { projectId, name } = await req.json();
  const o = await owner(projectId);
  if (o.error) return o.error;
  await db.envVar.deleteMany({ where: { projectId, name } });
  audit(o.user!.id, "env.delete", projectId, name);
  return NextResponse.json({ ok: true });
}
