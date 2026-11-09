import "dotenv/config";
import { Worker } from "bullmq";
import { QUEUE, redisConnection, type JobData } from "../lib/queue";
import { runSandboxed } from "../lib/docker-sandbox";
import { handleDeploy } from "./deploy";
import { handleMobile } from "./mobile";

// Worker process: npm run worker  (needs Redis + Docker running)
const worker = new Worker(
  QUEUE,
  async (job) => {
    const d = job.data as JobData;
    if (d.type === "sandbox") return runSandboxed(d.language, d.files);
    if (d.type === "deploy") return handleDeploy(d.deploymentId);
    if (d.type === "mobile") return handleMobile(d.releaseId);
    throw new Error("Unknown job type");
  },
  { connection: redisConnection(), concurrency: 2 }
);

worker.on("ready", () => console.log("Worker ready — waiting for jobs"));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
worker.on("error", (err) => console.error("Worker error:", err.message));
