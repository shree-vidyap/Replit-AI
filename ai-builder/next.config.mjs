/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true, // Sentry / OpenTelemetry (instrumentation.ts)
    serverComponentsExternalPackages: [
      "bullmq", "ioredis", "bcryptjs", "prom-client", "@aws-sdk/client-s3", "@sentry/node", "stripe",
    ],
  },
  // WebContainers need cross-origin isolation (use Chrome or Edge)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
