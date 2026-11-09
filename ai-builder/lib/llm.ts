// Provider-neutral model call (PDF: OpenAI, Anthropic, Gemini, or Ollama).
// Choose with AI_PROVIDER = anthropic | gemini | openai | ollama   (default: anthropic)

type Req = { system: string; user: string; maxTokens: number; json?: boolean };

const PROVIDERS = ["anthropic", "gemini", "openai", "ollama"];
export const provider = () => (process.env.AI_PROVIDER ?? "anthropic").toLowerCase().trim();

async function fetchOrExplain(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (e: any) {
    const c = e?.cause;
    throw new Error("Network error: " + (c?.code ?? c?.message ?? e?.message) + " (" + new URL(url).host + ")");
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetchOrExplain(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg: unknown = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message ?? j?.error ?? text;
    } catch {}
    throw new Error(`${r.status} ${String(msg).slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export async function complete(req: Req): Promise<string> {
  const p = provider();
  if (!PROVIDERS.includes(p)) throw new Error(`Unknown AI_PROVIDER "${p}" (use ${PROVIDERS.join(", ")})`);

  if (p === "anthropic") {
    const j = await post(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": need("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
      {
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      }
    );
    return (j.content ?? []).map((b: any) => b.text ?? "").join("");
  }

  if (p === "gemini") {
    const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
    const j = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": need("GEMINI_API_KEY") },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          maxOutputTokens: Math.max(req.maxTokens, 8192),
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }
    );
    return (j.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("");
  }

  if (p === "openai") {
    const j = await post(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${need("OPENAI_API_KEY")}` },
      {
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        max_completion_tokens: req.maxTokens,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }
    );
    return j.choices?.[0]?.message?.content ?? "";
  }

  // ollama: free, runs on your own computer (no key)
  const base = process.env.OLLAMA_URL ?? "http://localhost:11434";
  let j: any;
  try {
    j = await post(`${base}/api/chat`, {}, {
      model: process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b",
      stream: false,
      ...(req.json ? { format: "json" } : {}),
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      options: { num_predict: req.maxTokens, num_ctx: 16384 },
    });
  } catch (e: any) {
    if (String(e?.message).includes("fetch failed")) throw new Error("Ollama is not running at " + base);
    throw e;
  }
  return j.message?.content ?? "";
}
