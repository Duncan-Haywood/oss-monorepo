import { stripeSubscriptionBillingInterval } from "@/lib/orders/recurring";
import type { BundleBillingInterval } from "@/lib/pricing/bundles";

/**
 * Interface subset this module calls — matches the real Stripe SDK shape.
 * The Stripe client is passed in (not constructed here) so this stays unit
 * testable with a fake client — mirrors create-portal-session.ts's
 * StripeBillingPortalClient.
 */
export interface StripeGrowthUpsellBillingIntervalClient {
  checkout: {
    sessions: {
      retrieve(id: string, params: { expand: string[] }): Promise<{ subscription?: unknown }>;
    };
  };
}

/**
 * Best-effort lookup of a Growth order's actual billing cadence from its
 * Stripe Checkout Session — see growth-upsell-annual-billing-carry-through.
 * Never throws: a retrieve failure, a missing/unexpanded subscription, or
 * any other unexpected shape all resolve to "monthly", the original,
 * unconditional behavior sendGrowthUpsellAction had before this existed.
 * This is a diagnostic/copy-accuracy enhancement, not a money-correctness
 * gate, so a Stripe outage must never block the upsell send itself.
 */
export async function resolveGrowthOrderBillingInterval(
  stripe: StripeGrowthUpsellBillingIntervalClient,
  stripeSessionId: string,
): Promise<BundleBillingInterval> {
  try {
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
      expand: ["subscription"],
    });
    if (session.subscription && typeof session.subscription === "object") {
      return stripeSubscriptionBillingInterval(
        session.subscription as Parameters<typeof stripeSubscriptionBillingInterval>[0],
      );
    }
  } catch {
    // Best-effort — fall through to the conservative monthly default.
  }
  return "monthly";
}
