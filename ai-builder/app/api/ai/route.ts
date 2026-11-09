import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/ai-agent";
import { getCurrentUser } from "@/lib/db";
import { rateLimited } from "@/lib/ratelimit";
import { checkUsage, recordUsage } from "@/lib/usage";
import { audit } from "@/lib/audit";
import { metrics } from "@/lib/metrics";
import { getRole } from "@/lib/access";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const ip = req.headers.get("x-forwarded-for") ?? "local";

  if (!user && process.env.ALLOW_ANONYMOUS_AI === "false")
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  if (await rateLimited(`ai:${user?.id ?? ip}`, 10, 60))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });

  try {
    const { prompt, files, activeFile, errorLog, summary, projectId } = await req.json();
    if (typeof prompt !== "string" || typeof files !== "object")
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (user) {
      if (projectId) {
        const role = await getRole(projectId, user.id);
        if (role !== "owner" && role !== "editor")
          return NextResponse.json({ error: "No edit access to this project" }, { status: 403 });
      }
      const u = await checkUsage(user.id, user.plan, "ai");
      if (!u.ok)
        return NextResponse.json({ error: `Daily AI limit reached (${u.limit}). Upgrade on the Billing page.` }, { status: 402 });
      await recordUsage(user.id, "ai");
      audit(user.id, "ai.request", projectId, prompt);
    }

    const result = await runAgent({ prompt, files, activeFile, errorLog, summary });
    metrics.ai.inc({ status: "ok" });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("AI error:", e?.status, e?.message); metrics.ai.inc({ status: "error" });
    const bad = e?.message === "Bad AI output" || e?.message === "No JSON in AI response";
    return NextResponse.json({ error: bad ? "Bad AI output" : `AI request failed: ${String(e?.message ?? "").slice(0, 200)}` }, { status: bad ? 422 : 500 });
  }
}

