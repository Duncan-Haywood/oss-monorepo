import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createBillingPortalForCheckoutSession } from "@/lib/billing/create-portal-session";

/**
 * Customer self-serve Stripe Billing Portal from a completed Checkout Session.
 * Operator path uses openBillingPortalAction (auth-gated) instead.
 * See /docs/process (stripe-billing-portal).
 */

interface BillingPortalBody {
  sessionId?: string;
  returnUrl?: string;
}

export async function POST(request: Request) {
  let body: BillingPortalBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required (use the operator dashboard action for leadSlug)" },
      { status: 400 },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Set STRIPE_SECRET_KEY before opening the billing portal." },
      { status: 501 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const returnUrl = body.returnUrl?.trim() || `${appUrl}/checkout/success?session_id=${encodeURIComponent(sessionId)}`;

  const stripe = new Stripe(secretKey);
  const result = await createBillingPortalForCheckoutSession(stripe, sessionId, returnUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
