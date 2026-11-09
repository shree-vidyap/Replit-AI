import { auth } from "@/auth";
import { db } from "./prisma";

export { db };

/** Signed-in user (Auth.js session) or null. */
export async function getCurrentUser() {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
}
