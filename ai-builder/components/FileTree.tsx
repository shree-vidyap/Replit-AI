"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File as FileIcon, FilePlus, Folder, Trash2 } from "lucide-react";
import { isSafePath, type FileMap } from "@/lib/files";

type Node = { name: string; path: string; children?: Node[] };

function build(paths: string[]): Node[] {
  const root: Node = { name: "", path: "", children: [] };
  for (const p of paths.sort()) {
    let cur = root;
    p.split("/").forEach((part, i, arr) => {
      const path = arr.slice(0, i + 1).join("/");
      const isFile = i === arr.length - 1;
      let next = cur.children!.find((c) => c.name === part);
      if (!next) {
        next = isFile ? { name: part, path } : { name: part, path, children: [] };
        cur.children!.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: Node[]) => {
    n.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    n.forEach((c) => c.children && sort(c.children));
  };
  sort(root.children!);
  return root.children!;
}

function Row({ node, depth, active, onSelect, onDelete }: {
  node: Node; depth: number; active: string;
  onSelect: (p: string) => void; onDelete: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: 8 + depth * 12 };
  if (node.children) {
    return (
      <div>
        <button style={pad} onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-1 py-1 text-left text-sm text-gray-300 hover:bg-gray-800">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} /> {node.name}
        </button>
        {open && node.children.map((c) => (
          <Row key={c.path} node={c} depth={depth + 1} active={active} onSelect={onSelect} onDelete={onDelete} />
        ))}
      </div>
    );
  }
  return (
    <div style={pad}
      className={`group flex items-center justify-between py-1 pr-2 text-sm hover:bg-gray-800 ${active === node.path ? "bg-gray-800 text-white" : "text-gray-400"}`}>
      <button onClick={() => onSelect(node.path)} className="flex flex-1 items-center gap-1 text-left">
        <FileIcon size={14} /> {node.name}
      </button>
      <button onClick={() => onDelete(node.path)} className="opacity-0 group-hover:opacity-100" title="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function FileTree({ files, active, onSelect, onCreate, onDelete }: {
  files: FileMap; active: string;
  onSelect: (p: string) => void;
  onCreate: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const tree = useMemo(() => build(Object.keys(files)), [files]);

  function create() {
    const p = window.prompt("New file path (e.g. src/Button.jsx)");
    if (!p) return;
    if (!isSafePath(p)) return window.alert("Invalid path");
    onCreate(p);
  }
  function remove(p: string) {
    if (window.confirm(`Delete ${p}?`)) onDelete(p); // confirmation before destructive changes
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
        Files
        <button onClick={create} title="New file"><FilePlus size={15} /></button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {tree.map((n) => (
          <Row key={n.path} node={n} depth={0} active={active} onSelect={onSelect} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}
