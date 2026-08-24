import { NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCheckoutSessionId } from "@/lib/billing/checkout-session-id";
import { createBillingPortalForCheckoutSession } from "@/lib/billing/create-portal-session";
import { isAcceptableBillingPortalReturnUrl } from "@/lib/billing/return-url";
import { resolveStripeRedirectAppUrl } from "@/lib/security/app-url";
import { readJsonBodyWithByteLimit } from "@/lib/security/json-body";
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

  const parsedBody = await readJsonBodyWithByteLimit<BillingPortalBody>(request);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return NextResponse.json({ error: "Request body is too large" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value;

  const parsedSessionId = parseCheckoutSessionId(body.sessionId);
  if (!parsedSessionId.ok) {
    if (parsedSessionId.reason === "too_long") {
      return NextResponse.json(
        { error: "sessionId is too long" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "sessionId is required (use the operator dashboard action for leadSlug)" },
      { status: 400 },
    );
  }
  const sessionId = parsedSessionId.sessionId;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Set STRIPE_SECRET_KEY before opening the billing portal." },
      { status: 501 },
    );
  }

  // Never trust request.url / Host for the comparison origin or default
  // return_url — a Host-spoofed appUrl would let isSameOriginReturnUrl pass
  // an attacker returnUrl. See resolveStripeRedirectAppUrl.
  const appUrl = resolveStripeRedirectAppUrl();
  const defaultReturnUrl = `${appUrl}/checkout/success?session_id=${encodeURIComponent(sessionId)}`;
  const trimmedReturnUrl = body.returnUrl?.trim();
  // Same-origin + finite length (see isAcceptableBillingPortalReturnUrl) —
  // over-long / cross-origin / malformed all fall back to the derived default.
  const returnUrl =
    trimmedReturnUrl && isAcceptableBillingPortalReturnUrl(trimmedReturnUrl, appUrl)
      ? trimmedReturnUrl
      : defaultReturnUrl;

  const stripe = new Stripe(secretKey);
  const result = await createBillingPortalForCheckoutSession(stripe, sessionId, returnUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
