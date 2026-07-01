import { NextResponse } from "next/server";

/**
 * Placeholder Stripe Checkout session creator.
 * Replace with Stripe SDK integration in Phase 3 (see /docs/roadmap).
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Stripe checkout not configured",
      message:
        "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID_WEBSITE, then implement session creation.",
      docs: "/docs/roadmap#phase-3-payments",
    },
    { status: 501 },
  );
}
