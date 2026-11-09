import { NextResponse } from "next/server";
import { db, getCurrentUser } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// Stripe billing: upgrade to Pro
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_PRO)
    return NextResponse.json({ error: "Stripe is not configured (STRIPE_SECRET_KEY, STRIPE_PRICE_PRO)" }, { status: 503 });
  try {
    const s = stripe();
    let customer = user.stripeCustomerId;
    if (!customer) {
      customer = (await s.customers.create({ email: user.email })).id;
      await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer } });
    }
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: process.env.STRIPE_PRICE_PRO, quantity: 1 }],
      success_url: `${base}/billing?status=success`,
      cancel_url: `${base}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Stripe request failed" }, { status: 502 });
  }
}
