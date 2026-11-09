"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        const r = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!r.ok) return setError((await r.json()).error ?? "Registration failed");
      }
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) return setError("Wrong email or password");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/dashboard";
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Log in" : "Create account"}</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
        className="rounded border border-gray-700 bg-gray-900 px-3 py-2" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)"
        type="password" onKeyDown={(e) => e.key === "Enter" && submit()}
        className="rounded border border-gray-700 bg-gray-900 px-3 py-2" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={submit} disabled={busy}
        className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50">
        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
      </button>
      <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        className="text-sm text-gray-400 hover:text-gray-200">
        {mode === "login" ? "No account? Register" : "Have an account? Log in"}
      </button>
    </main>
  );
}
