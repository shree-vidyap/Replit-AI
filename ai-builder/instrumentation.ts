// Monitoring: Sentry + OpenTelemetry (both optional via env), Prometheus at /api/metrics
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
