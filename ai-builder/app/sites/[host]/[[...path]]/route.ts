import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { contentTypeFor, getObject } from "@/lib/storage";

// Serves deployed projects from S3: <slug>.localhost (or SITES_DOMAIN) and verified custom domains.
async function resolve(host: string) {
  const domain = process.env.SITES_DOMAIN ?? "localhost";
  if (host.endsWith(`.${domain}`)) {
    return db.project.findUnique({ where: { slug: host.slice(0, -(domain.length + 1)) }, select: { liveDeploymentId: true } });
  }
  const d = await db.domain.findUnique({
    where: { hostname: host },
    select: { verified: true, project: { select: { liveDeploymentId: true } } },
  });
  return d?.verified ? d.project : null;
}

export async function GET(_req: NextRequest, { params }: { params: { host: string; path?: string[] } }) {
  const host = decodeURIComponent(params.host).split(":")[0].toLowerCase();
  const project = await resolve(host).catch(() => null);
  if (!project?.liveDeploymentId) return new NextResponse("Site not found", { status: 404 });

  const rel = (params.path ?? []).map(decodeURIComponent).join("/");
  if (rel.includes("..")) return new NextResponse("Bad request", { status: 400 });
  const base = `sites/${project.liveDeploymentId}/`;
  const wantsFile = rel.includes(".");
  let key = rel || "index.html";
  let body = await getObject(base + key);
  if (!body && !wantsFile) {
    key = "index.html"; // single-page app fallback
    body = await getObject(base + key);
  }
  if (!body) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypeFor(key),
      "Cache-Control": key === "index.html" ? "no-cache" : "public, max-age=3600",
    },
  });
}
