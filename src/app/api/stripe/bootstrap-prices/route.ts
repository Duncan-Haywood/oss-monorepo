import { NextResponse } from "next/server";
import Stripe from "stripe";
import { assessStripeBootstrapGate } from "@/lib/pricing/bootstrap-gate";
import { bootstrapStripePrices } from "@/lib/pricing/bootstrap-stripe-prices";

/**
 * Operator-only bootstrap for Stripe Price objects.
 * Requires ALLOW_STRIPE_BOOTSTRAP=1 and STRIPE_SECRET_KEY.
 * See /docs/roadmap#phase-3-payments and the stripe-price-objects backlog item.
 * Dashboard twin: bootstrapStripePricesAction on the checkout-blocked banner.
 */

export async function POST() {
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
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    return NextResponse.json({ error: "Bootstrap failed", message }, { status: 502 });
  }
}
