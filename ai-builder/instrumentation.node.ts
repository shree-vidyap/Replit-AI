export async function initMonitoring() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
  if (process.env.OTEL_ENABLED === "true") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "ai-builder" });
  }
}

initMonitoring().catch((e) => console.error("monitoring init failed", e));
