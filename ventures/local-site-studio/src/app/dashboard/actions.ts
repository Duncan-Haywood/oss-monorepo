"use server";

import Stripe from "stripe";
import { requireOperatorAuth } from "@/lib/auth/operator";
import { assessStripeBootstrapGate } from "@/lib/pricing/bootstrap-gate";
import { bootstrapStripePrices } from "@/lib/pricing/bootstrap-stripe-prices";
import type { BootstrapPriceResult } from "@/lib/pricing/bootstrap-stripe-prices";

export type BootstrapStripePricesActionResult =
  | {
      success: true;
      results: BootstrapPriceResult[];
      envSnippet: string;
      next: string;
    }
  | { success: false; error: string };

/**
 * Operator-triggered Stripe Price bootstrap from the dashboard banner.
 * Same ALLOW_STRIPE_BOOTSTRAP=1 gate as POST /api/stripe/bootstrap-prices —
 * does not fake-complete stripe-price-objects (paste envSnippet + unset flag).
 */
export async function bootstrapStripePricesAction(): Promise<BootstrapStripePricesActionResult> {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }

    const gate = assessStripeBootstrapGate();
    if (!gate.ok) {
      return { success: false, error: gate.message };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      // assessStripeBootstrapGate already checked; belt-and-suspenders for tsc
      return {
        success: false,
        error: "Set STRIPE_SECRET_KEY before bootstrapping prices.",
      };
    }

    const stripe = new Stripe(secretKey);
    const { results, envSnippet } = await bootstrapStripePrices(stripe);
    return {
      success: true,
      results,
      envSnippet,
      next: "Paste envSnippet into .env.local / hosting secrets, set STRIPE_WEBHOOK_SECRET, then unset ALLOW_STRIPE_BOOTSTRAP.",
    };
  } catch (error) {
    console.error("Error in bootstrapStripePricesAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}
