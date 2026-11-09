import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// Stripe webhook: keeps User.plan in sync with the subscription
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const setPlan = (customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, plan: string) => {
    const id = typeof customer === "string" ? customer : customer?.id;
    return id ? db.user.updateMany({ where: { stripeCustomerId: id }, data: { plan } }) : null;
  };

  if (event.type === "checkout.session.completed") {
    await setPlan((event.data.object as Stripe.Checkout.Session).customer, "pro");
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    await setPlan(sub.customer, ["active", "trialing"].includes(sub.status) ? "pro" : "free");
  } else if (event.type === "customer.subscription.deleted") {
    await setPlan((event.data.object as Stripe.Subscription).customer, "free");
  }
  return NextResponse.json({ received: true });
}
