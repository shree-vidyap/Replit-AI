const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env","utf8").split(/\r?\n/).filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")]}));
const key = env.GEMINI_API_KEY || "";
const model = env.GEMINI_MODEL || "gemini-flash-latest";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Say hi" }] }] });
const variants = {
  "x-goog-api-key header": { url, headers: { "x-goog-api-key": key } },
  "key= in URL": { url: url + "?key=" + encodeURIComponent(key), headers: {} },
  "Bearer header": { url, headers: { authorization: "Bearer " + key } },
};
(async () => {
  console.log("key starts with:", key.slice(0, 3), "| length:", key.length, "| model:", model);
  for (const [name, v] of Object.entries(variants)) {
    try {
      const r = await fetch(v.url, { method: "POST", headers: { "content-type": "application/json", ...v.headers }, body, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      let msg = ""; try { msg = JSON.parse(t).error?.message ?? ""; } catch {}
      console.log(name.padEnd(24), "->", r.status, msg.slice(0, 120));
    } catch (e) { console.log(name.padEnd(24), "-> FAILED", e.name, e.cause?.code || e.message); }
  }
  console.log("finished");
})();
