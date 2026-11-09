import { db } from "./prisma";

/** Audit log of AI and platform actions (fire and forget). */
export function audit(userId: string | null, action: string, projectId?: string, detail?: string) {
  db.auditLog
    .create({ data: { userId, projectId, action, detail: detail?.slice(0, 500) } })
    .catch(() => {});
}
