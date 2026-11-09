import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { getRole } from "@/lib/access";
import { audit } from "@/lib/audit";

// Custom domains: owner adds a hostname, creates a TXT record to prove ownership, then points a CNAME at the platform.
async function owner(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((await getRole(projectId, user.id)) !== "owner")
    return { error: NextResponse.json({ error: "Only the owner can manage domains" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const o = await owner(projectId);
  if (o.error) return o.error;
  const domains = await db.domain.findMany({ where: { projectId } });
  return NextResponse.json({ domains, cnameTarget: (process.env.APP_HOSTS ?? "localhost").split(",")[0].split(":")[0] });
}

const Add = z.object({
  projectId: z.string(),
  hostname: z.string().toLowerCase().regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a valid hostname like app.example.com"),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "verify") {
    const d = await db.domain.findUnique({ where: { id: body.id } });
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const o = await owner(d.projectId);
    if (o.error) return o.error;
    try {
      const records = (await dns.resolveTxt(`_aibuilder.${d.hostname}`)).flat();
      if (!records.includes(d.verifyToken)) return NextResponse.json({ error: "TXT record not found yet (DNS can take a while)" }, { status: 400 });
    } catch {
      return NextResponse.json({ error: "TXT record not found yet (DNS can take a while)" }, { status: 400 });
    }
    await db.domain.update({ where: { id: d.id }, data: { verified: true } });
    audit(o.user!.id, "domain.verify", d.projectId, d.hostname);
    return NextResponse.json({ ok: true });
  }

  const parsed = Add.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const o = await owner(parsed.data.projectId);
  if (o.error) return o.error;
  if (await db.domain.findUnique({ where: { hostname: parsed.data.hostname } }))
    return NextResponse.json({ error: "Hostname is already in use" }, { status: 409 });
  const d = await db.domain.create({
    data: { projectId: parsed.data.projectId, hostname: parsed.data.hostname, verifyToken: randomBytes(16).toString("hex") },
  });
  audit(o.user!.id, "domain.add", parsed.data.projectId, d.hostname);
  return NextResponse.json({ domain: d });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const d = await db.domain.findUnique({ where: { id } });
  if (!d) return NextResponse.json({ ok: true });
  const o = await owner(d.projectId);
  if (o.error) return o.error;
  await db.domain.delete({ where: { id } });
  audit(o.user!.id, "domain.remove", d.projectId, d.hostname);
  return NextResponse.json({ ok: true });
}
