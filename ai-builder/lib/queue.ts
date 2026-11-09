import { Queue, QueueEvents } from "bullmq";
import type { FileMap } from "./files";

// Redis + BullMQ worker queue (PDF: queue system)
export const QUEUE = "jobs";

export function redisConnection() {
  const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined };
}

export type JobData =
  | { type: "deploy"; deploymentId: string }
  | { type: "mobile"; releaseId: string }
  | { type: "sandbox"; language: string; files: FileMap };

let q: Queue | null = null;
let ev: QueueEvents | null = null;

export function queue() {
  return (q ??= new Queue(QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
  }));
}
export function queueEvents() {
  return (ev ??= new QueueEvents(QUEUE, { connection: redisConnection() }));
}
