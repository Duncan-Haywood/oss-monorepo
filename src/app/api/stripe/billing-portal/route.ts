import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createBillingPortalForCheckoutSession } from "@/lib/billing/create-portal-session";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Customer self-serve Stripe Billing Portal from a completed Checkout Session.
 * Operator path uses openBillingPortalAction (auth-gated) instead.
 * See /docs/process (stripe-billing-portal).
 *
 * Public and keyed only by a client-supplied sessionId, like every other
 * public route that fires a live Stripe API call — rate limited per client
 * IP (best-effort, per-instance — see src/lib/security/rate-limit.ts) to
 * blunt scripted sessionId probing / Stripe quota burn.
 */

interface BillingPortalBody {
  sessionId?: string;
  returnUrl?: string;
}

export async function POST(request: Request) {
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`billing-portal:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

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
