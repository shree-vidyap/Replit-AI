import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/db";
import { queue, queueEvents } from "@/lib/queue";
import { RUNTIMES } from "@/lib/docker-sandbox";
import { checkUsage, recordUsage } from "@/lib/usage";
import { rateLimited } from "@/lib/ratelimit";
import { isSafePath } from "@/lib/files";
import { metrics } from "@/lib/metrics";
import { audit } from "@/lib/audit";

// Python / Java / Go / PHP run in isolated Docker containers through the worker queue.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to run server-side languages" }, { status: 401 });
  if (await rateLimited(`run:${user.id}`, 10, 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { language, files, projectId } = await req.json();
  if (!RUNTIMES[language]) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  if (typeof files !== "object" || !Object.keys(files).every(isSafePath))
    return NextResponse.json({ error: "Invalid files" }, { status: 400 });

  const u = await checkUsage(user.id, user.plan, "sandbox");
  if (!u.ok) return NextResponse.json({ error: `Daily run limit reached (${u.limit})` }, { status: 402 });

  try {
    const job = await queue().add("sandbox", { type: "sandbox", language, files });
    const result = await job.waitUntilFinished(queueEvents(), 60_000);
    await recordUsage(user.id, "sandbox");
    metrics.sandbox.inc({ language });
    audit(user.id, "sandbox.run", projectId, language);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Run failed. Are Redis and the worker running (docker compose up -d, npm run worker)?" },
      { status: 503 }
    );
  }
}
