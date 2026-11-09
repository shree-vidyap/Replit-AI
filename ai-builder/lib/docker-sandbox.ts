import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSafePath, type FileMap } from "./files";

// Server-side isolated containers (PDF: never run untrusted code on the main server;
// non-root user, CPU / memory / time limits, no access to the internal network).
export const RUNTIMES: Record<string, { image: string; cmd: string }> = {
  python: { image: "python:3.12-alpine", cmd: "python main.py" },
  java: { image: "eclipse-temurin:21-jdk-alpine", cmd: "javac Main.java && java Main" },
  go: { image: "golang:1.22-alpine", cmd: "go run ." },
  php: { image: "php:8.3-cli-alpine", cmd: "php index.php" },
};

const SAFE_FLAGS = [
  "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256",
];

export async function writeProject(dir: string, files: FileMap) {
  for (const [p, content] of Object.entries(files)) {
    if (!isSafePath(p)) continue;
    const full = path.join(dir, p);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  await chmod(dir, 0o777);
}

export function dockerRun(args: string[], timeoutMs: number, name: string, onData?: (s: string) => void) {
  return new Promise<{ code: number; output: string; timedOut: boolean }>((resolve) => {
    const p = spawn("docker", args);
    let output = "";
    let timedOut = false;
    const add = (d: Buffer) => {
      const s = d.toString();
      if (output.length < 64_000) output += s;
      onData?.(s);
    };
    p.stdout.on("data", add);
    p.stderr.on("data", add);
    // stop long-running or abnormal processes automatically
    const timer = setTimeout(() => {
      timedOut = true;
      spawn("docker", ["kill", name]);
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 127, output: `Could not start docker: ${e.message}`, timedOut });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output: timedOut ? output + "\n[stopped: time limit reached]" : output, timedOut });
    });
  });
}

/** Run Python / Java / Go / PHP code: no network, 256 MB, 0.5 CPU, 20 s, read-only root filesystem. */
export async function runSandboxed(language: string, files: FileMap) {
  const rt = RUNTIMES[language];
  if (!rt) return { code: 2, output: `Unsupported language: ${language}` };
  const dir = await mkdtemp(path.join(os.tmpdir(), "ab-run-"));
  const name = `ab-run-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeProject(dir, files);
    const args = [
      "run", "--rm", "--name", name, "--network", "none", "--memory", "256m", "--cpus", "0.5",
      ...SAFE_FLAGS, "--read-only", "--tmpfs", "/tmp:rw,size=64m,exec",
      "-e", "HOME=/tmp", "-e", "GOCACHE=/tmp/gocache", "-v", `${dir}:/work`, "-w", "/work",
      rt.image, "sh", "-c", rt.cmd,
    ];
    const r = await dockerRun(args, 20_000, name);
    return { code: r.code, output: r.output };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Build a static web project (npm install + npm run build) inside a container. */
export async function buildStatic(files: FileMap, env: Record<string, string>, onLog: (s: string) => void) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ab-build-"));
  const envFile = path.join(os.tmpdir(), `ab-env-${Math.random().toString(36).slice(2, 10)}`);
  const name = `ab-build-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeProject(dir, files);
    const envLines = Object.entries(env).map(([k, v]) => `${k}=${v.replace(/\r?\n/g, " ")}`).join("\n");
    await writeFile(envFile, envLines, { mode: 0o600 });
    const args = [
      "run", "--rm", "--name", name, "--memory", "1g", "--cpus", "1", ...SAFE_FLAGS,
      "--env-file", envFile, "-e", "HOME=/tmp", "-e", "npm_config_cache=/tmp/.npm", "-e", "CI=true",
      "-v", `${dir}:/work`, "-w", "/work", "node:20-alpine",
      "sh", "-c", "npm install --no-audit --no-fund && npm run build",
    ];
    const r = await dockerRun(args, 5 * 60_000, name, onLog);
    if (r.code !== 0) return { ok: false as const, files: {} as Record<string, Buffer> };

    const out: Record<string, Buffer> = {};
    const walk = async (rel: string) => {
      for (const e of await readdir(path.join(dir, "dist", rel), { withFileTypes: true })) {
        const r2 = path.posix.join(rel, e.name);
        if (e.isDirectory()) await walk(r2);
        else out[r2] = await readFile(path.join(dir, "dist", r2));
      }
    };
    try {
      await walk("");
    } catch {
      onLog("\nNo dist/ folder found after build.\n");
      return { ok: false as const, files: {} };
    }
    return { ok: true as const, files: out };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(envFile, { force: true }).catch(() => {});
  }
}

/** Run EAS CLI (Expo Application Services) inside a container for mobile builds / updates. */
export async function runEas(
  files: FileMap, easArgs: string, token: string, onLog: (s: string) => void
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ab-eas-"));
  const envFile = path.join(os.tmpdir(), `ab-env-${Math.random().toString(36).slice(2, 10)}`);
  const name = `ab-eas-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeProject(dir, files);
    await writeFile(envFile, `EXPO_TOKEN=${token}`, { mode: 0o600 });
    const script =
      "npm install --no-audit --no-fund && npx --yes expo install --fix && " +
      "(grep -q projectId app.json || npx --yes eas-cli@latest init --non-interactive --force) && " +
      `npx --yes eas-cli@latest ${easArgs}`;
    const args = [
      "run", "--rm", "--name", name, "--memory", "2g", "--cpus", "1", ...SAFE_FLAGS,
      "--env-file", envFile, "-e", "HOME=/tmp", "-e", "npm_config_cache=/tmp/.npm",
      "-e", "EAS_NO_VCS=1", "-e", "CI=1", "-v", `${dir}:/work`, "-w", "/work", "node:20-alpine",
      "sh", "-c", script,
    ];
    let appJson: string | null = null;
    const r = await dockerRun(args, 10 * 60_000, name, onLog);
    try { appJson = await readFile(path.join(dir, "app.json"), "utf8"); } catch {}
    return { code: r.code, output: r.output, appJson };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(envFile, { force: true }).catch(() => {});
  }
}
