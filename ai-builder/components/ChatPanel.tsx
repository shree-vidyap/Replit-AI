"use client";
import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { applyOperations, diffSummary, type AgentResult, type FileMap, type Operation } from "@/lib/files";
import { runAllowed } from "@/lib/sandbox";

type Msg = { role: "user" | "assistant"; text: string };

export default function ChatPanel({ files, activeFile, onApply, projectId, summary, onSummary, readOnly }: {
  files: FileMap;
  activeFile: string;
  projectId?: string;
  summary: string;
  onSummary: (s: string) => void;
  readOnly?: boolean;
  /** Applies operations to workspace state and creates a version checkpoint. */
  onApply: (ops: Operation[], message: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<AgentResult | null>(null);
  const [lastError, setLastError] = useState("");

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);

  async function send(prompt: string, errorLog?: string) {
    if (!prompt.trim() || loading) return;
    push({ role: "user", text: prompt });
    setInput("");
    setLoading(true);
    setLastError("");
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, files, activeFile, errorLog, summary, projectId }),
      });
      const data = await r.json();
      if (!r.ok) {
        push({ role: "assistant", text: `Error: ${data.error ?? "request failed"}` });
      } else {
        push({ role: "assistant", text: data.message });
        setPending(data);
      }
    } catch {
      push({ role: "assistant", text: "Network error." });
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!pending) return;
    const { operations, commands, message } = pending;
    if (operations.some((o) => o.type === "delete") && !window.confirm("The AI wants to delete files. Continue?")) return;
    setPending(null);
    onApply(operations, message);

    // Build/test execution → read errors → offer auto-fix
    for (const cmd of commands) {
      push({ role: "assistant", text: `Running: ${cmd}` });
      const { code, output } = await runAllowed(cmd);
      if (code !== 0) {
        setLastError(output.slice(-4000));
        push({ role: "assistant", text: `"${cmd}" failed. You can ask me to fix the errors.` });
        break;
      }
    }
  }

  const diff = pending ? diffSummary(files, pending.operations) : [];

  async function summarize() {
    setLoading(true);
    try {
      const r = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, files }),
      });
      const d = await r.json();
      if (r.ok) {
        onSummary(d.summary);
        push({ role: "assistant", text: `Codebase summary: ${d.summary}` });
      } else push({ role: "assistant", text: `Error: ${d.error}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
        AI chat
        <button onClick={summarize} disabled={loading || readOnly} title="Summarize the codebase so the AI understands it better"
          className="rounded border border-gray-700 px-2 py-0.5 normal-case hover:bg-gray-800 disabled:opacity-40">
          {summary ? "Re-summarize" : "Summarize codebase"}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
        {messages.length === 0 && (
          <p className="text-gray-500">Try: “Add a todo list with add and delete buttons.”</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-blue-300" : "text-gray-200"}>
            <span className="mr-1 font-semibold">{m.role === "user" ? "You:" : "AI:"}</span>
            {m.text}
          </div>
        ))}
        {loading && <p className="text-gray-500">Thinking…</p>}

        {pending && (
          <div className="rounded border border-gray-700 p-2">
            <p className="mb-2 text-xs text-gray-400">
              Proposed changes ({pending.operations.length} files
              {pending.commands.length ? `, then: ${pending.commands.join(", ")}` : ""})
            </p>
            <div className="max-h-56 space-y-2 overflow-auto font-mono text-xs">
              {diff.map((d) => (
                <div key={d.path}>
                  <div className="text-yellow-300">{d.type}: {d.path}</div>
                  {d.removed.slice(0, 15).map((l, i) => <div key={"r" + i} className="text-red-400">- {l}</div>)}
                  {d.added.slice(0, 15).map((l, i) => <div key={"a" + i} className="text-green-400">+ {l}</div>)}
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={approve} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium hover:bg-green-500">
                <Check size={13} /> Apply
              </button>
              <button onClick={() => setPending(null)} className="flex items-center gap-1 rounded border border-gray-600 px-3 py-1 text-xs hover:bg-gray-800">
                <X size={13} /> Reject
              </button>
            </div>
          </div>
        )}

        {lastError && (
          <button onClick={() => send("Fix the build errors.", lastError)}
            className="rounded border border-red-500 px-3 py-1 text-xs text-red-300 hover:bg-red-950">
            Auto-fix errors
          </button>
        )}
      </div>

      <div className="flex gap-2 border-t border-gray-800 p-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder={readOnly ? "View-only access" : "Describe a change…"} disabled={readOnly}
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm" />
        <button onClick={() => send(input)} disabled={loading || readOnly}
          className="rounded bg-blue-600 px-3 hover:bg-blue-500 disabled:opacity-50">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
