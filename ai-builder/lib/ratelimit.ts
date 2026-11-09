import IORedis from "ioredis";

// Redis-backed rate limit (falls back to in-memory if Redis is not running)
let client: IORedis | null = null;
function redis() {
  if (!client) {
    client = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true,
    });
    client.on("error", () => {});
  }
  return client;
}

const mem = new Map<string, number[]>();

export async function rateLimited(key: string, max = 10, windowSec = 60): Promise<boolean> {
  try {
    const r = redis();
    if (r.status === "wait") await r.connect();
    const k = `rl:${key}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, windowSec);
    return n > max;
  } catch {
    const now = Date.now();
    const recent = (mem.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
    recent.push(now);
    mem.set(key, recent);
    return recent.length > max;
  }
}
