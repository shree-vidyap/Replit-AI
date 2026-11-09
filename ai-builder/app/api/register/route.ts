import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { rateLimited } from "@/lib/ratelimit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (await rateLimited(`register:${ip}`, 5, 600)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and a password of 8+ characters" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  try {
    if (await db.user.findUnique({ where: { email } }))
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    await db.user.create({
      data: { email, name: parsed.data.name, passwordHash: await bcrypt.hash(parsed.data.password, 12) },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database error — is Postgres running and migrated?" }, { status: 500 });
  }
}
