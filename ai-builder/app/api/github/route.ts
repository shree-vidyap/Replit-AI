import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getCurrentUser } from "@/lib/db";
import { getRole } from "@/lib/access";
import { decrypt, encrypt } from "@/lib/crypto";
import { pushToGithub } from "@/lib/github";
import { audit } from "@/lib/audit";

const Body = z.object({
  projectId: z.string(),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/name"),
  token: z.string().min(10).optional(),
  remember: z.boolean().optional(),
});

// GitHub integration: push the project's files as a commit
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const { projectId, repo, token, remember } = parsed.data;
  if ((await getRole(projectId, user.id)) !== "owner") return NextResponse.json({ error: "Only the owner can push" }, { status: 403 });

  try {
    let t = token;
    if (!t && user.githubToken) t = decrypt(user.githubToken);
    if (!t) return NextResponse.json({ error: "Enter a GitHub personal access token (repo scope)" }, { status: 400 });
    if (token && remember) await db.user.update({ where: { id: user.id }, data: { githubToken: encrypt(token) } });

    const rows = await db.projectFile.findMany({ where: { projectId } });
    const files = Object.fromEntries(rows.map((r: { path: string; content: string }) => [r.path, r.content]));
    const res = await pushToGithub(t, repo, files, "Update from AI Builder");
    audit(user.id, "github.push", projectId, repo);
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message ?? "Push failed").slice(0, 200) }, { status: 502 });
  }
}
