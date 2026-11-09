import type { FileMap } from "./files";

export type SearchHit = { path: string; line: number; text: string };

/** File search across the whole project (PDF Phase 3). */
export function searchFiles(files: FileMap, query: string, limit = 200): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path.toLowerCase().includes(q)) hits.push({ path, line: 0, text: "(file name)" });
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ path, line: i + 1, text: lines[i].trim().slice(0, 120) });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
