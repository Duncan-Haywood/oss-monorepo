import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireOperatorAuth } from "@/lib/auth/operator";
import { captureError } from "@/lib/observability/error-tracking";
import { assessStripeBootstrapGate } from "@/lib/pricing/bootstrap-gate";
import { bootstrapStripePrices } from "@/lib/pricing/bootstrap-stripe-prices";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Operator-only bootstrap for Stripe Price objects.
 * Requires an authenticated operator session (when OPERATOR_DASHBOARD_PASSWORD
 * is set) plus ALLOW_STRIPE_BOOTSTRAP=1 and STRIPE_SECRET_KEY, and is rate
 * limited per client IP for defense-in-depth alongside every other public
 * Stripe-facing route.
 * See /docs/roadmap#phase-3-payments and the stripe-price-objects backlog item.
 * Dashboard twin: bootstrapStripePricesAction on the checkout-blocked banner.
 */

export async function POST(request: Request) {
  const auth = await requireOperatorAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`bootstrap-prices:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const gate = assessStripeBootstrapGate();
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: gate.error,
        message: gate.message,
        docs: "/docs/roadmap#phase-3-payments",
      },
      { status: gate.status },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return NextResponse.json(
      {
        error: "Stripe not configured",
        message: "Set STRIPE_SECRET_KEY before bootstrapping prices.",
      },
      { status: 501 },
    );
  }

  try {
    const stripe = new Stripe(secretKey);
    const { results, envSnippet } = await bootstrapStripePrices(stripe);
    return NextResponse.json({
      ok: true,
      results,
      envSnippet,
      next: "Paste envSnippet into .env.local / hosting secrets, set STRIPE_WEBHOOK_SECRET, then unset ALLOW_STRIPE_BOOTSTRAP.",
    });
  } catch (error) {
    console.error("Error in POST /api/stripe/bootstrap-prices:", error);
    await captureError(error, {
      component: "stripe-bootstrap-prices-route",
      failureKind: "bootstrap_prices",
    });
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    return NextResponse.json({ error: "Bootstrap failed", message }, { status: 502 });
  }
}
