import client from "prom-client";

// Prometheus metrics (exposed at /api/metrics)
const g = globalThis as any;
if (!g.__metrics) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  g.__metrics = {
    registry,
    ai: new client.Counter({ name: "ai_requests_total", help: "AI agent requests", labelNames: ["status"], registers: [registry] }),
    deploys: new client.Counter({ name: "deployments_total", help: "Deployments queued", registers: [registry] }),
    sandbox: new client.Counter({ name: "sandbox_runs_total", help: "Sandbox runs queued", labelNames: ["language"], registers: [registry] }),
  };
}
export const metrics = g.__metrics as {
  registry: client.Registry;
  ai: client.Counter<"status">;
  deploys: client.Counter<string>;
  sandbox: client.Counter<"language">;
};
