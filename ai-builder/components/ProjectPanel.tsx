"use client";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { STATIC_DEPLOYABLE } from "@/lib/templates";

async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

const input = "w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm";
const btn = "rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800 disabled:opacity-40";
const primary = "rounded bg-blue-600 px-3 py-1 text-xs font-medium hover:bg-blue-500 disabled:opacity-40";

function Msg({ text }: { text: string }) {
  return text ? <p className="mt-2 text-xs text-yellow-300">{text}</p> : null;
}

/* ---------------- Deploy ---------------- */
function Deploy({ projectId, framework }: { projectId: string; framework: string }) {
  const [deps, setDeps] = useState<any[]>([]);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { ok, data } = await api(`/api/deploy?projectId=${projectId}`);
    if (ok) { setDeps(data.deployments); setLiveUrl(data.liveUrl); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const active = deps.some((d) => ["queued", "building", "uploading"].includes(d.status));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [active, load]);

  async function deploy() {
    setMsg("");
    const { ok, data } = await api("/api/deploy", "POST", { projectId });
    if (!ok) return setMsg(data.error ?? "Deploy failed");
    load();
  }

  if (!STATIC_DEPLOYABLE.includes(framework))
    return <p className="text-sm text-gray-500">Deploy currently supports React (Vite) projects.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Builds in an isolated Docker container (worker), then publishes to storage.</p>
      <button onClick={deploy} disabled={active} className={primary}>{active ? "Deploying…" : "Deploy"}</button>
      {liveUrl && (
        <p className="text-sm">Live: <a className="text-blue-400 underline" href={liveUrl} target="_blank" rel="noreferrer">{liveUrl}</a></p>
      )}
      <Msg text={msg} />
      {deps[0] && (
        <details open={active}>
          <summary className="cursor-pointer text-xs text-gray-400">Latest: {deps[0].status}</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black p-2 text-[11px] text-green-300">
            {deps[0].logs || "…"}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ---------------- Domains ---------------- */
function Domains({ projectId }: { projectId: string }) {
  const [domains, setDomains] = useState<any[]>([]);
  const [target, setTarget] = useState("");
  const [host, setHost] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { ok, data } = await api(`/api/domains?projectId=${projectId}`);
    if (ok) { setDomains(data.domains); setTarget(data.cnameTarget); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const { ok, data } = await api("/api/domains", "POST", { projectId, hostname: host });
    if (!ok) return setMsg(data.error ?? "Failed");
    setHost(""); setMsg(""); load();
  }
  async function verify(id: string) {
    const { ok, data } = await api("/api/domains", "POST", { action: "verify", id });
    setMsg(ok ? "Verified" : data.error ?? "Failed");
    load();
  }
  async function remove(id: string) { await api("/api/domains", "DELETE", { id }); load(); }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className={input} value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.example.com" />
        <button onClick={add} className={primary}>Add</button>
      </div>
      {domains.map((d) => (
        <div key={d.id} className="rounded border border-gray-800 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span>{d.hostname} {d.verified ? "✅" : "⏳"}</span>
            <span className="flex gap-1">
              {!d.verified && <button onClick={() => verify(d.id)} className={btn}>Verify</button>}
              <button onClick={() => remove(d.id)} className={btn}>Remove</button>
            </span>
          </div>
          {!d.verified && (
            <p className="mt-1 text-gray-500">
              Add a TXT record <code>_aibuilder.{d.hostname}</code> = <code className="break-all">{d.verifyToken}</code>, and a CNAME to <code>{target}</code>.
            </p>
          )}
        </div>
      ))}
      <Msg text={msg} />
    </div>
  );
}

/* ---------------- Mobile (Expo / EAS) ---------------- */
function Mobile({ projectId }: { projectId: string }) {
  const [rels, setRels] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { ok, data } = await api(`/api/mobile?projectId=${projectId}`);
    if (ok) setRels(data.releases);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const active = rels.some((r) => ["queued", "running"].includes(r.status));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  async function start(kind: "build" | "update", platform = "android") {
    setMsg("");
    const { ok, data } = await api("/api/mobile", "POST", { projectId, kind, platform });
    if (!ok) return setMsg(data.error ?? "Failed");
    load();
  }
  const withUrl = rels.find((r) => r.url);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Expo Go preview: publishes an update and shows a QR code to scan with Expo Go. Cloud builds (Android APK / iOS) run on EAS and are a paid feature.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => start("update")} disabled={active} className={primary}>QR preview (Expo Go)</button>
        <button onClick={() => start("build", "android")} disabled={active} className={btn}>Android build</button>
        <button onClick={() => start("build", "ios")} disabled={active} className={btn}>iOS build</button>
      </div>
      <Msg text={msg} />
      {withUrl && (
        <div className="flex items-center gap-3 rounded border border-gray-800 p-2">
          <div className="rounded bg-white p-1"><QRCodeSVG value={withUrl.url} size={96} /></div>
          <p className="break-all text-xs text-gray-400">{withUrl.kind === "update" ? "Scan with Expo Go:" : "Build page:"}<br />{withUrl.url}</p>
        </div>
      )}
      {rels.map((r) => (
        <details key={r.id} className="text-xs">
          <summary className="cursor-pointer text-gray-400">
            {r.kind} · {r.platform} · {r.status} · {new Date(r.createdAt).toLocaleString()}
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black p-2 text-[11px] text-green-300">{r.logs || "…"}</pre>
        </details>
      ))}
      <p className="text-[11px] text-gray-600">
        App signing and releases are managed by EAS (credentials are created on first build; see README).
      </p>
    </div>
  );
}

/* ---------------- GitHub ---------------- */
function GitHub({ projectId }: { projectId: string }) {
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function push() {
    setBusy(true); setMsg("");
    const { ok, data } = await api("/api/github", "POST", { projectId, repo, token: token || undefined, remember });
    setBusy(false);
    setMsg(ok ? `Pushed: ${data.url}` : data.error ?? "Push failed");
    if (ok) setToken("");
  }
  return (
    <div className="space-y-2">
      <input className={input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" />
      <input className={input} type="password" value={token} onChange={(e) => setToken(e.target.value)}
        placeholder="GitHub token (repo scope) — leave empty if saved" />
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save token (encrypted)
      </label>
      <button onClick={push} disabled={busy} className={primary}>{busy ? "Pushing…" : "Push to GitHub"}</button>
      <Msg text={msg} />
    </div>
  );
}

/* ---------------- Share ---------------- */
function Share({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { ok, data } = await api(`/api/share?projectId=${projectId}`);
    if (ok) setMembers(data.members);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  async function add() {
    const { ok, data } = await api("/api/share", "POST", { projectId, email, role });
    if (!ok) return setMsg(data.error ?? "Failed");
    setEmail(""); setMsg(""); load();
  }
  async function remove(userId: string) { await api("/api/share", "DELETE", { projectId, userId }); load(); }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-gray-700 bg-gray-900 px-1 text-sm">
          <option value="viewer">Viewer</option><option value="editor">Editor</option>
        </select>
        <button onClick={add} className={primary}>Invite</button>
      </div>
      {members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between text-xs">
          <span>{m.email} <span className="text-gray-500">({m.role})</span></span>
          <button onClick={() => remove(m.userId)} className={btn}>Remove</button>
        </div>
      ))}
      <Msg text={msg} />
    </div>
  );
}

/* ---------------- Environment variables + assets ---------------- */
function Env({ projectId }: { projectId: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { ok, data } = await api(`/api/env?projectId=${projectId}`);
    if (ok) setNames(data.names);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    const { ok, data } = await api("/api/env", "PUT", { projectId, name, value });
    if (!ok) return setMsg(data.error ?? "Failed");
    setName(""); setValue(""); setMsg(""); load();
  }
  async function remove(n: string) { await api("/api/env", "DELETE", { projectId, name: n }); load(); }
  async function upload(f: File | undefined) {
    if (!f) return;
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("file", f);
    const r = await fetch("/api/upload", { method: "POST", body: form });
    const d = await r.json();
    setMsg(r.ok ? `Uploaded (scanned): ${d.key}` : d.error ?? "Upload failed");
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Encrypted at rest. Values are used when deploying and are never sent to the AI.</p>
      <div className="flex gap-2">
        <input className={input} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="VITE_API_URL" />
        <input className={input} type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
        <button onClick={save} className={primary}>Save</button>
      </div>
      {names.map((n) => (
        <div key={n} className="flex items-center justify-between text-xs">
          <code>{n}</code><button onClick={() => remove(n)} className={btn}>Delete</button>
        </div>
      ))}
      <div className="border-t border-gray-800 pt-3">
        <p className="mb-1 text-xs text-gray-500">Upload an asset (images, fonts, pdf, text — scanned, max 5 MB)</p>
        <input type="file" onChange={(e) => upload(e.target.files?.[0])} className="text-xs" />
      </div>
      <Msg text={msg} />
    </div>
  );
}

/* ---------------- Panel ---------------- */
export default function ProjectPanel({ projectId, framework, role }: { projectId: string; framework: string; role: string }) {
  const isOwner = role === "owner";
  const tabs = [
    "Deploy", "Domains", ...(framework === "expo" ? ["Mobile"] : []), "GitHub", "Share", "Settings",
  ].filter((t) => isOwner || t === "Deploy" || t === "Mobile");
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-gray-800 px-2 py-2">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded px-2 py-1 text-xs ${tab === t ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === "Deploy" && <Deploy projectId={projectId} framework={framework} />}
        {tab === "Domains" && <Domains projectId={projectId} />}
        {tab === "Mobile" && <Mobile projectId={projectId} />}
        {tab === "GitHub" && <GitHub projectId={projectId} />}
        {tab === "Share" && <Share projectId={projectId} />}
        {tab === "Settings" && <Env projectId={projectId} />}
      </div>
    </div>
  );
}
