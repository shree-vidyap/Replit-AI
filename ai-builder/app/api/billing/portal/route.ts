import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.stripeCustomerId) return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Stripe request failed" }, { status: 502 });
  }
}
