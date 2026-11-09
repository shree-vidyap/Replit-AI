import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/db";
import { canWrite, getRole } from "@/lib/access";
import { scanUpload } from "@/lib/scan";
import { putObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

// Asset upload: scanned, then stored in S3-compatible storage
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!canWrite(await getRole(projectId, user.id))) return NextResponse.json({ error: "No edit access" }, { status: 403 });

  const data = Buffer.from(await file.arrayBuffer());
  const scan = scanUpload(file.name, data);
  if (!scan.ok) return NextResponse.json({ error: scan.reason }, { status: 400 });

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const key = `projects/${projectId}/uploads/${Date.now()}-${safeName}`;
  try {
    await putObject(key, data, file.type || undefined);
  } catch {
    return NextResponse.json({ error: "Storage is not reachable. Is MinIO running (docker compose up -d)?" }, { status: 503 });
  }
  audit(user.id, "upload", projectId, safeName);
  return NextResponse.json({ key });
}
