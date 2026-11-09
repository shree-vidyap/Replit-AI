import { WebContainer, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";
import { ALLOWED_COMMANDS, type FileMap } from "./files";

/** Browser runtime (WebContainers) — client-side only. */
let instance: WebContainer | null = null;
let booting: Promise<WebContainer> | null = null;
let devProc: WebContainerProcess | null = null;
let autoStop: ReturnType<typeof setTimeout> | null = null;

let handlers = {
  onLog: (_s: string) => {},
  onUrl: (_u: string) => {},
};

export function setHandlers(h: Partial<typeof handlers>) {
  handlers = { ...handlers, ...h };
}

export function isBooted() {
  return instance !== null;
}

export async function boot() {
  if (instance) return instance;
  booting ??= WebContainer.boot();
  instance = await booting;
  instance.on("server-ready", (_port, url) => handlers.onUrl(url));
  return instance;
}

export function toTree(files: FileMap): FileSystemTree {
  const tree: any = {};
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    let node = tree;
    parts.slice(0, -1).forEach((p) => (node = (node[p] ??= { directory: {} }).directory));
    node[parts.at(-1)!] = { file: { contents: content } };
  }
  return tree;
}

export async function exec(cmd: string, args: string[] = []) {
  const c = await boot();
  handlers.onLog(`$ ${[cmd, ...args].join(" ")}\n`);
  const p = await c.spawn(cmd, args);
  let output = "";
  p.output.pipeTo(
    new WritableStream({
      write(d) {
        output += d;
        handlers.onLog(d);
      },
    })
  );
  const code = await p.exit;
  return { code, output };
}

async function startDev() {
  const c = await boot();
  devProc?.kill();
  handlers.onLog("$ npm run dev\n");
  devProc = await c.spawn("npm", ["run", "dev"]);
  devProc.output.pipeTo(new WritableStream({ write: (d) => handlers.onLog(d) }));
  // stop long-running processes automatically
  if (autoStop) clearTimeout(autoStop);
  autoStop = setTimeout(() => {
    stopAll();
    handlers.onLog("[stopped: 30 minute time limit]\n");
  }, 30 * 60_000);
}

export function stopAll() {
  devProc?.kill();
  devProc = null;
  if (autoStop) clearTimeout(autoStop);
  autoStop = null;
}

/** Preview flow: write files → install → npm run dev → server-ready → iframe. */
export async function startProject(files: FileMap) {
  const c = await boot();
  await c.mount(toTree(files));
  const install = await exec("npm", ["install", "--no-progress", "--no-audit", "--no-fund"]);
  if (install.code !== 0) return install;
  await startDev();
  return install;
}

/** Keep the running container in sync with editor changes (Vite HMR updates the preview). */
export async function syncFiles(prev: FileMap, next: FileMap) {
  if (!instance) return;
  for (const [path, content] of Object.entries(next)) {
    if (prev[path] === content) continue;
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir) await instance.fs.mkdir(dir, { recursive: true });
    await instance.fs.writeFile(path, content);
  }
  for (const path of Object.keys(prev)) {
    if (!(path in next)) await instance.fs.rm(path, { force: true });
  }
}

/** Runs only allowlisted commands. */
export async function runAllowed(command: string) {
  const cmd = command.trim();
  if (!ALLOWED_COMMANDS.includes(cmd)) {
    handlers.onLog(`Blocked command: ${cmd}\n`);
    return { code: 126, output: "blocked" };
  }
  if (cmd === "npm run dev") {
    await startDev();
    return { code: 0, output: "" };
  }
  const [bin, ...args] = cmd.split(" ");
  return exec(bin, args);
}
