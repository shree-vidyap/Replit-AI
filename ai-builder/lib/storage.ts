import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";

// Storage for deployed sites and uploads.
// STORAGE_DRIVER=local (default): files on disk in ./.storage  (no extra service needed)
// STORAGE_DRIVER=s3: any S3-compatible storage (AWS S3, Cloudflare R2, ...)
const driver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
const root = path.resolve(process.env.STORAGE_DIR ?? ".storage");
const bucket = process.env.S3_BUCKET ?? "ai-builder";

let client: S3Client | null = null;
function s3() {
  return (client ??= new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  }));
}

let ready = false;
export async function ensureBucket() {
  if (driver !== "s3" || ready) return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket }));
  }
  ready = true;
}

function localPath(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putObject(key: string, body: Buffer | string, contentType?: string) {
  if (driver === "local") {
    const full = localPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return;
  }
  await ensureBucket();
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    if (driver === "local") return await readFile(localPath(key));
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  txt: "text/plain; charset=utf-8", woff: "font/woff", woff2: "font/woff2", map: "application/json",
};
export function contentTypeFor(path: string) {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
