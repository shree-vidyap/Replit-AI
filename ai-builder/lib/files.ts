export type FileMap = Record<string, string>;

export type Operation = {
  type: "write" | "delete" | "modify";
  path: string;
  content?: string;
};

export type AgentResult = {
  message: string;
  operations: Operation[];
  commands: string[];
};

/** Only these commands may run in the sandbox (PDF: no arbitrary shell commands). */
export const ALLOWED_COMMANDS = [
  "npm install",
  "npm run dev",
  "npm run build",
  "npm run lint",
  "npm test",
];

export function isAllowedCommand(cmd: string) {
  return ALLOWED_COMMANDS.includes(cmd.trim());
}

/** Blocks traversal, absolute paths, node_modules and secret files. */
export function isSafePath(p: string) {
  if (!p || p.startsWith("/") || p.includes("..") || p.includes("\\") || p.includes("\0")) return false;
  if (p.startsWith("node_modules/")) return false;
  const name = p.split("/").pop() ?? "";
  if (name.startsWith(".env")) return false;
  return true;
}

export function applyOperations(files: FileMap, ops: Operation[]): FileMap {
  const next: FileMap = { ...files };
  for (const op of ops) {
    if (!isSafePath(op.path)) continue;
    if (op.type === "delete") delete next[op.path];
    else if (typeof op.content === "string") next[op.path] = op.content;
  }
  return next;
}

export type DiffEntry = { path: string; type: Operation["type"]; added: string[]; removed: string[] };

/** Simple line-set diff to show the user before approving changes. */
export function diffSummary(files: FileMap, ops: Operation[]): DiffEntry[] {
  return ops
    .filter((o) => isSafePath(o.path))
    .map((o) => {
      const before = (files[o.path] ?? "").split("\n");
      const after = o.type === "delete" ? [] : (o.content ?? "").split("\n");
      const b = new Set(before);
      const a = new Set(after);
      return {
        path: o.path,
        type: o.type,
        added: after.filter((l) => !b.has(l) && l.trim() !== ""),
        removed: before.filter((l) => !a.has(l) && l.trim() !== ""),
      };
    });
}

export function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", html: "html", md: "markdown", mjs: "javascript", cjs: "javascript",
  };
  return map[ext ?? ""] ?? "plaintext";
}
