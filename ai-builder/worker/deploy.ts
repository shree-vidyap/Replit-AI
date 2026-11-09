import { db } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { buildStatic } from "../lib/docker-sandbox";
import { contentTypeFor, putObject } from "../lib/storage";

export async function handleDeploy(deploymentId: string) {
  const dep = await db.deployment.findUnique({ where: { id: deploymentId } });
  if (!dep) return;
  let logs = "";
  const flush = setInterval(() => db.deployment.update({ where: { id: dep.id }, data: { logs } }).catch(() => {}), 2000);
  const log = (s: string) => { logs = (logs + s).slice(-20_000); };

  try {
    await db.deployment.update({ where: { id: dep.id }, data: { status: "building" } });
    const rows = await db.projectFile.findMany({ where: { projectId: dep.projectId } });
    const files = Object.fromEntries(rows.map((r: { path: string; content: string }) => [r.path, r.content]));
    const vars = await db.envVar.findMany({ where: { projectId: dep.projectId } });
    const env: Record<string, string> = {};
    for (const v of vars) env[v.name] = decrypt(v.valueEnc);

    log("Building in an isolated container…\n");
    const res = await buildStatic(files, env, log);
    if (!res.ok) throw new Error("Build failed");

    await db.deployment.update({ where: { id: dep.id }, data: { status: "uploading" } });
    log("\nUploading to storage…\n");
    for (const [p, body] of Object.entries(res.files)) {
      await putObject(`sites/${dep.id}/${p}`, body, contentTypeFor(p));
    }
    await db.$transaction([
      db.deployment.update({ where: { id: dep.id }, data: { status: "live", finishedAt: new Date() } }),
      db.project.update({ where: { id: dep.projectId }, data: { liveDeploymentId: dep.id } }),
    ]);
    log("Deployment is live.\n");
  } catch (e: any) {
    log(`\n${e.message}\n`);
    await db.deployment.update({ where: { id: dep.id }, data: { status: "failed", finishedAt: new Date() } });
  } finally {
    clearInterval(flush);
    await db.deployment.update({ where: { id: dep.id }, data: { logs } }).catch(() => {});
  }
}
