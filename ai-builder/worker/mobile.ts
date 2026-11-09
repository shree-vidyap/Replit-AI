import { db } from "../lib/prisma";
import { runEas } from "../lib/docker-sandbox";

// Mobile builds through EAS (Expo Application Services): Android/iOS binaries, or an update for Expo Go (QR code).
export async function handleMobile(releaseId: string) {
  const rel = await db.release.findUnique({ where: { id: releaseId }, include: { project: true } });
  if (!rel) return;
  const token = process.env.EXPO_TOKEN;
  let logs = "";
  const flush = setInterval(() => db.release.update({ where: { id: rel.id }, data: { logs } }).catch(() => {}), 2000);
  const log = (s: string) => { logs = (logs + s).slice(-20_000); };

  try {
    if (!token) throw new Error("EXPO_TOKEN is not set on the worker");
    await db.release.update({ where: { id: rel.id }, data: { status: "running" } });
    const rows = await db.projectFile.findMany({ where: { projectId: rel.projectId } });
    const files = Object.fromEntries(rows.map((r: { path: string; content: string }) => [r.path, r.content]));

    const easArgs =
      rel.kind === "update"
        ? `update --branch preview --message "AI Builder preview" --non-interactive --json`
        : `build --platform ${rel.platform} --profile preview --non-interactive --no-wait --json`;

    const r = await runEas(files, easArgs, token, log);
    if (r.code !== 0) throw new Error("EAS command failed");

    // Persist app.json if `eas init` linked the project
    if (r.appJson && r.appJson !== files["app.json"]) {
      await db.projectFile.updateMany({ where: { projectId: rel.projectId, path: "app.json" }, data: { content: r.appJson } });
    }

    let url = r.output.match(/https:\/\/expo\.dev\/accounts\/[^\s"')]+/)?.[0] ?? null;
    if (rel.kind === "update") {
      const group = r.output.match(/"group"\s*:\s*"([0-9a-f-]{36})"/)?.[1];
      let projectId: string | undefined;
      try { projectId = JSON.parse(r.appJson ?? files["app.json"] ?? "{}")?.expo?.extra?.eas?.projectId; } catch {}
      if (group && projectId) url = `exp://u.expo.dev/${projectId}/group/${group}`; // scan with Expo Go
    }
    await db.release.update({ where: { id: rel.id }, data: { status: "submitted", url } });
    log("\nDone.\n");
  } catch (e: any) {
    log(`\n${e.message}\n`);
    await db.release.update({ where: { id: rel.id }, data: { status: "failed" } });
  } finally {
    clearInterval(flush);
    await db.release.update({ where: { id: rel.id }, data: { logs } }).catch(() => {});
  }
}
