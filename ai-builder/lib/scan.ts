// Basic upload scanning (PDF: scan uploaded files). Use ClamAV in production.
const ALLOWED = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "txt", "md", "json", "csv", "woff", "woff2", "pdf"];
export const MAX_UPLOAD = 5 * 1024 * 1024;

export function scanUpload(name: string, data: Buffer): { ok: boolean; reason?: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.includes(ext)) return { ok: false, reason: `File type .${ext} is not allowed` };
  if (data.length > MAX_UPLOAD) return { ok: false, reason: "File is larger than 5 MB" };
  const head = data.subarray(0, 4);
  if (head[0] === 0x4d && head[1] === 0x5a) return { ok: false, reason: "Executable (MZ) detected" };
  if (head[0] === 0x7f && head.toString("latin1", 1, 4) === "ELF") return { ok: false, reason: "Executable (ELF) detected" };
  if (head.toString("latin1", 0, 2) === "#!") return { ok: false, reason: "Script detected" };
  const text = data.toString("latin1");
  if (text.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) return { ok: false, reason: "Malware test signature" };
  if (ext === "svg" && /<script|onload=|javascript:/i.test(text)) return { ok: false, reason: "Unsafe SVG" };
  return { ok: true };
}
