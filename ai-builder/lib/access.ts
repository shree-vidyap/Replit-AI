import { db } from "./prisma";

export type Role = "owner" | "editor" | "viewer";

export async function getRole(projectId: string, userId: string): Promise<Role | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, members: { where: { userId }, select: { role: true } } },
  });
  if (!p) return null;
  if (p.ownerId === userId) return "owner";
  const m = p.members[0]?.role;
  return m === "editor" ? "editor" : m === "viewer" ? "viewer" : null;
}

export const canWrite = (r: Role | null) => r === "owner" || r === "editor";
