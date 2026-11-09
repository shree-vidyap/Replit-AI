"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { History, Play, Save, Square } from "lucide-react";
import CodeEditor from "@/components/Editor";
import FileTree from "@/components/FileTree";
import SearchPanel from "@/components/SearchPanel";
import ChatPanel from "@/components/ChatPanel";
import ProjectPanel from "@/components/ProjectPanel";
import Preview from "@/components/Preview";
import Terminal from "@/components/Terminal";
import { applyOperations, languageFor, type FileMap, type Operation } from "@/lib/files";
import { getTemplate, SERVER_LANGUAGES, TEMPLATES } from "@/lib/templates";
import { isBooted, setHandlers, startProject, stopAll, syncFiles } from "@/lib/sandbox";

type VersionRow = { id: string; message: string; createdAt: string };

export default function Workspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const isLocal = projectId === "local";

  const [files, setFiles] = useState<FileMap>({});
  const [active, setActive] = useState("");
  const [framework, setFramework] = useState("react-vite");
  const [role, setRole] = useState<string>("owner");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [rightTab, setRightTab] = useState<"chat" | "project">("chat");
  const synced = useRef<FileMap>({});
  const localKey = useRef("ai-builder:local-files:react-vite");
  const readOnly = role === "viewer";
  const serverLang = SERVER_LANGUAGES.includes(framework);

  // Load project (local template, or from Postgres when logged in)
  useEffect(() => {
    setHandlers({ onLog: (s) => setLogs((l) => l + s), onUrl: setUrl });
    (async () => {
      let loaded: FileMap | null = null;
      if (isLocal) {
        const t = new URLSearchParams(window.location.search).get("template") ?? "react-vite";
        const tpl = TEMPLATES[t] ? t : "react-vite";
        setFramework(tpl);
        localKey.current = `ai-builder:local-files:${tpl}`;
        try {
          const raw = localStorage.getItem(localKey.current);
          if (raw) loaded = JSON.parse(raw);
          setSummary(localStorage.getItem(localKey.current + ":summary") ?? "");
        } catch {}
        loaded ??= getTemplate(tpl);
      } else {
        const r = await fetch(`/api/files?projectId=${projectId}`);
        if (!r.ok) return setStatus("Could not load project");
        const data = await r.json();
        loaded = data.files;
        setVersions(data.versions);
        setFramework(data.framework);
        setRole(data.role);
        setSummary(data.summary ?? "");
      }
      setFiles(loaded!);
      const keys = Object.keys(loaded!);
      setActive(keys.find((p) => /(^|\/)(App\.(jsx|tsx|js)|page\.tsx|index\.js|main\.py|Main\.java|main\.go|index\.php)$/.test(p)) ?? keys[0]);
    })();
  }, [projectId, isLocal]);

  // Live-sync edits into the running container (Vite HMR refreshes the preview)
  useEffect(() => {
    if (!isBooted() || !Object.keys(files).length) return;
    const t = setTimeout(async () => {
      await syncFiles(synced.current, files);
      synced.current = files;
    }, 500);
    return () => clearTimeout(t);
  }, [files]);

  const save = useCallback(async (next: FileMap, message = "Manual save") => {
    if (readOnly) return;
    if (isLocal) {
      try { localStorage.setItem(localKey.current, JSON.stringify(next)); setStatus("Saved locally"); } catch {}
      return;
    }
    const r = await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, files: next, message }),
    });
    setStatus(r.ok ? "Saved (new version)" : "Save failed");
    if (r.ok) {
      const d = await (await fetch(`/api/files?projectId=${projectId}`)).json();
      setVersions(d.versions);
    }
  }, [isLocal, projectId, readOnly]);

  async function run() {
    setRunning(true);
    setUrl(null);
    if (serverLang) {
      // Python / Java / Go / PHP run in an isolated Docker container through the worker
      setLogs((l) => l + `$ run ${framework} in Docker sandbox\n`);
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: framework, files, projectId: isLocal ? undefined : projectId }),
      });
      const d = await r.json();
      setLogs((l) => l + (r.ok ? `${d.output}\n[exit ${d.code}]\n` : `${d.error}\n`));
      setRunning(false);
      return;
    }
    synced.current = files;
    const res = await startProject(files);
    if (res.code !== 0) setRunning(false);
  }
  useEffect(() => { if (url) setRunning(false); }, [url]);

  function stop() {
    stopAll();
    setUrl(null);
    setRunning(false);
    setLogs((l) => l + "\n[stopped]\n");
  }

  // Every meaningful AI change creates a version checkpoint
  function applyAi(ops: Operation[], message: string) {
    if (readOnly) return;
    const next = applyOperations(files, ops);
    setFiles(next);
    const firstWritten = ops.find((o) => o.type !== "delete")?.path;
    if (firstWritten) setActive(firstWritten);
    save(next, `AI: ${message}`);
  }

  async function restore(versionId: string) {
    const r = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, versionId }),
    });
    if (!r.ok) return setStatus("Restore failed");
    const { files: restored } = await r.json();
    setFiles(restored);
    setActive(Object.keys(restored)[0]);
    setShowVersions(false);
    save(restored, "Restored earlier version");
  }

  function onSummary(s: string) {
    setSummary(s);
    if (isLocal) try { localStorage.setItem(localKey.current + ":summary", s); } catch {}
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-sm">
        <Link href="/" className="font-semibold">AI Builder</Link>
        <span className="text-gray-500">
          {isLocal ? "Local workspace" : `Project ${projectId.slice(0, 8)}`}
          {role !== "owner" && <span className="ml-2 rounded bg-gray-800 px-2 text-xs">{role}</span>}
        </span>
        {isLocal && (
          <select value={framework}
            onChange={(e) => (window.location.href = `/workspace/local?template=${e.target.value}`)}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs">
            {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        )}
        {!isLocal && <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300">Dashboard</Link>}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{status}</span>
          {!isLocal && (
            <button onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-1 rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">
              <History size={14} /> Versions
            </button>
          )}
          {!readOnly && (
            <button onClick={() => save(files)}
              className="flex items-center gap-1 rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">
              <Save size={14} /> Save
            </button>
          )}
          {!serverLang && (running || url) && (
            <button onClick={stop} className="flex items-center gap-1 rounded border border-red-600 px-3 py-1 text-red-300 hover:bg-red-950">
              <Square size={13} /> Stop
            </button>
          )}
          <button onClick={run} disabled={running}
            className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 font-medium hover:bg-green-500 disabled:opacity-50">
            <Play size={14} /> {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>

      {showVersions && (
        <div className="max-h-40 overflow-auto border-b border-gray-800 bg-gray-900 px-4 py-2 text-sm">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-1">
              <span>{v.message} <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</span></span>
              {!readOnly && <button onClick={() => restore(v.id)} className="rounded border border-gray-600 px-2 text-xs hover:bg-gray-800">Restore</button>}
            </div>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[230px_1fr_360px] grid-rows-[minmax(0,1fr)] overflow-hidden">
        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px] overflow-hidden border-r border-gray-800">
          <FileTree files={files} active={active}
            onSelect={setActive}
            onCreate={(p) => { if (!readOnly) { setFiles({ ...files, [p]: "" }); setActive(p); } }}
            onDelete={(p) => {
              if (readOnly) return;
              const { [p]: _, ...rest } = files;
              setFiles(rest);
              if (active === p) setActive(Object.keys(rest)[0] ?? "");
            }} />
          <SearchPanel files={files} onOpen={setActive} />
        </aside>

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
          <div className={`grid overflow-hidden border-b border-gray-800 ${serverLang ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="border-r border-gray-800">
              {active && (
                <CodeEditor code={files[active] ?? ""} language={languageFor(active)} readOnly={readOnly}
                  onChange={(v) => setFiles((prev) => ({ ...prev, [active]: v }))} />
              )}
            </div>
            {!serverLang && <Preview url={url} running={running} />}
          </div>
          <Terminal logs={logs} onClear={() => setLogs("")} />
        </main>

        <aside className="flex flex-col overflow-hidden border-l border-gray-800">
          {!isLocal && (
            <div className="flex border-b border-gray-800 text-xs">
              {(["chat", "project"] as const).map((t) => (
                <button key={t} onClick={() => setRightTab(t)}
                  className={`flex-1 py-2 uppercase tracking-wide ${rightTab === t ? "bg-gray-900 text-white" : "text-gray-500"}`}>
                  {t === "chat" ? "AI chat" : "Project"}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            {rightTab === "chat" || isLocal ? (
              <ChatPanel files={files} activeFile={active} onApply={applyAi} projectId={isLocal ? undefined : projectId}
                summary={summary} onSummary={onSummary} readOnly={readOnly} />
            ) : (
              <ProjectPanel projectId={projectId} framework={framework} role={role} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
