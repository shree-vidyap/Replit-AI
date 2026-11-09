import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

// Auth.js (PDF: Auth.js, Clerk, or Supabase Auth) — email + password, JWT sessions
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const p = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(raw);
        if (!p.success) return null;
        const user = await db.user.findUnique({ where: { email: p.data.email.toLowerCase() } });
        if (!user?.passwordHash) return null;
        if (!(await bcrypt.compare(p.data.password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) (session.user as any).id = token.uid as string;
      return session;
    },
  },
});
