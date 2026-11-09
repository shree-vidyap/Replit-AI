"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Usage = {
  plan: string;
  limits: Record<string, number>;
  today: Record<string, number>;
  total30: Record<string, number>;
};

const LABELS: Record<string, string> = {
  ai: "AI requests", deploy: "Deployments", sandbox: "Sandbox runs", build: "Mobile builds", update: "Expo Go previews",
};

export default function Billing() {
  const [u, setU] = useState<Usage | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/usage").then((r) => (r.ok ? r.json() : null)).then(setU);
  }, []);

  async function go(path: "checkout" | "portal") {
    setMsg("");
    const r = await fetch(`/api/billing/${path}`, { method: "POST" });
    const d = await r.json();
    if (d.url) window.location.href = d.url;
    else setMsg(d.error ?? "Something went wrong");
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-200">← Dashboard</Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold">Billing & usage</h1>
      {!u ? <p className="text-gray-500">Loading…</p> : (
        <>
          <p className="mb-6 text-gray-400">
            Plan: <span className="font-semibold uppercase text-white">{u.plan}</span>
          </p>
          <div className="mb-6 space-y-3">
            {Object.keys(LABELS).map((k) => {
              const used = u.today[k] ?? 0;
              const limit = u.limits[k] ?? 0;
              const pct = limit ? Math.min(100, (used / limit) * 100) : 100;
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm">
                    <span>{LABELS[k]} <span className="text-gray-500">(last 24h)</span></span>
                    <span className="text-gray-400">{used} / {limit}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-gray-800">
                    <div className="h-2 rounded bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-600">30-day total: {u.total30[k] ?? 0}</p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            {u.plan === "free" ? (
              <button onClick={() => go("checkout")} className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500">
                Upgrade to Pro
              </button>
            ) : (
              <button onClick={() => go("portal")} className="rounded border border-gray-600 px-4 py-2 hover:bg-gray-800">
                Manage subscription
              </button>
            )}
          </div>
          {msg && <p className="mt-3 text-sm text-red-400">{msg}</p>}
        </>
      )}
    </main>
  );
}
