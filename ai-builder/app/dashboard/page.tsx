"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { TEMPLATES } from "@/lib/templates";

type P = { id: string; name: string; framework: string; updatedAt: string; shared: boolean };

export default function Dashboard() {
  const [projects, setProjects] = useState<P[]>([]);
  const [name, setName] = useState("");
  const [framework, setFramework] = useState("react-vite");
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/projects");
    if (!r.ok) return setError("Could not load projects. Is Postgres running and migrated?");
    setProjects((await r.json()).projects);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, framework }),
    });
    if (!r.ok) return setError("Could not create project.");
    setName("");
    load();
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/billing" className="rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">Billing & usage</Link>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">
            Log out
          </button>
        </div>
      </div>
      <div className="mb-6 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2" />
        <select value={framework} onChange={(e) => setFramework(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-3 py-2">
          {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <button onClick={create} className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500">Create</button>
      </div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/workspace/${p.id}`}
              className="flex justify-between rounded border border-gray-800 px-4 py-3 hover:bg-gray-900">
              <span>{p.name} {p.shared && <span className="ml-2 rounded bg-gray-800 px-2 text-xs text-gray-400">shared</span>}</span>
              <span className="text-sm text-gray-500">{TEMPLATES[p.framework]?.label ?? p.framework}</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && !error && <li className="text-gray-500">No projects yet.</li>}
      </ul>
    </main>
  );
}
