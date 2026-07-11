import { NextResponse } from "next/server";
import Stripe from "stripe";
import { bootstrapStripePrices } from "@/lib/pricing/bootstrap-stripe-prices";

/**
 * Operator-only bootstrap for Stripe Price objects.
 * Requires ALLOW_STRIPE_BOOTSTRAP=1 and STRIPE_SECRET_KEY.
 * See /docs/roadmap#phase-3-payments and the stripe-price-objects backlog item.
 */

export async function POST() {
  if (process.env.ALLOW_STRIPE_BOOTSTRAP !== "1") {
    return NextResponse.json(
      {
        error: "Stripe price bootstrap disabled",
        message:
          "Set ALLOW_STRIPE_BOOTSTRAP=1 (and STRIPE_SECRET_KEY) in the environment, then POST again. Disable the flag after copying Price IDs into secrets.",
        docs: "/docs/roadmap#phase-3-payments",
      },
      { status: 403 },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
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
