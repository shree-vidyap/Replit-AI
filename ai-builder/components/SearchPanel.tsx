"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { searchFiles } from "@/lib/search";
import type { FileMap } from "@/lib/files";

export default function SearchPanel({ files, onOpen }: { files: FileMap; onOpen: (path: string) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchFiles(files, q), [files, q]);

  return (
    <div className="flex h-full flex-col border-t border-gray-800">
      <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
        <Search size={14} className="text-gray-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…"
          className="w-full bg-transparent text-sm outline-none" />
      </div>
      <div className="flex-1 overflow-auto text-xs">
        {q.length >= 2 && hits.length === 0 && <p className="p-3 text-gray-500">No results</p>}
        {hits.map((h, i) => (
          <button key={i} onClick={() => onOpen(h.path)} className="block w-full px-3 py-1 text-left hover:bg-gray-800">
            <div className="truncate text-gray-300">{h.path}{h.line ? `:${h.line}` : ""}</div>
            <div className="truncate text-gray-500">{h.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
