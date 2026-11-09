import { NextRequest, NextResponse } from "next/server";
import { summarizeProject } from "@/lib/ai-agent";
import { canWrite, getRole } from "@/lib/access";
import { db, getCurrentUser } from "@/lib/db";
import { rateLimited } from "@/lib/ratelimit";
import { checkUsage, recordUsage } from "@/lib/usage";

// Codebase summary (Phase 3). Saved on the project when logged in; kept in the browser for the local workspace.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!user && process.env.ALLOW_ANONYMOUS_AI === "false")
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  if (await rateLimited(`sum:${user?.id ?? ip}`, 5, 60))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.AI_PROVIDER)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  try {
    const { projectId, files } = await req.json();
    if (typeof files !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (user) {
      if (projectId && !canWrite(await getRole(projectId, user.id)))
        return NextResponse.json({ error: "No edit access" }, { status: 403 });
      const u = await checkUsage(user.id, user.plan, "ai");
      if (!u.ok) return NextResponse.json({ error: "Daily AI limit reached" }, { status: 402 });
      await recordUsage(user.id, "ai");
    }
    const summary = await summarizeProject(files);
    if (user && projectId) await db.project.update({ where: { id: projectId }, data: { summary } });
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "Summary failed" }, { status: 500 });
  }
}
