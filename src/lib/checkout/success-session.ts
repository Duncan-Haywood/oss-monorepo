/**
 * Confirms a completed Stripe Checkout Session for /checkout/success.
 *
 * The page is keyed only by a client-supplied session_id query param (leaks
 * via redirect URLs / Referer / history) — the same opaque-id class as
 * POST /api/stripe/billing-portal. Hard-reject over-length via
 * parseCheckoutSessionId before any stripe.checkout.sessions.retrieve so a
 * crafted multi-KB query cannot burn Stripe quota (checkout-success-sessionId-
 * field-length-cap). Soft-cap is wrong: truncation guarantees a miss that
 * still costs a retrieve.
 *
 * showBillingPortal must mirror createBillingPortalForCheckoutSession:
 * subscription mode is eligible without a line-item round-trip; payment mode
 * derives commerceAddon from listLineItems Price IDs (never metadata) before
 * checkoutSessionEligibleForBillingPortal (success-page-commerceAddon-line-
 * item-parity). listLineItems failures fail closed to hide the CTA (buyer
 * can refresh; portal API returns 502 on the same failure).
 */

import Stripe from "stripe";
import { parseCheckoutSessionId } from "@/lib/billing/checkout-session-id";
import { checkoutSessionEligibleForBillingPortal } from "@/lib/billing/portal";
import {
  commerceAddonPriceIdsFromEnv,
  priceIdsFromStripeLineItems,
  resolveCommerceAddonFromLineItems,
} from "@/lib/payments/commerce-addon-line-items";

export type ConfirmedCheckoutSuccess = {
  confirmed: true;
  sessionId: string;
  showBillingPortal: boolean;
};

export type UnconfirmedCheckoutSuccess = {
  confirmed: false;
};

export type CheckoutSuccessLoadResult =
  | ConfirmedCheckoutSuccess
  | UnconfirmedCheckoutSuccess;

export type RetrieveCheckoutSession = (
  sessionId: string,
) => Promise<Pick<Stripe.Checkout.Session, "status" | "mode" | "metadata">>;

export type ListCheckoutSessionLineItems = (
  sessionId: string,
) => Promise<{ data: Array<{ price?: string | { id?: string | null } | null }> }>;

/**
 * Parse + optionally retrieve. Over-long / missing session ids short-circuit
 * to unconfirmed without touching Stripe.
 */
export async function loadCheckoutSuccessSession(
  sessionIdRaw: string | undefined,
  options: {
    secretKey: string | undefined;
    retrieve?: RetrieveCheckoutSession;
    listLineItems?: ListCheckoutSessionLineItems;
  },
): Promise<CheckoutSuccessLoadResult> {
  const parsed = parseCheckoutSessionId(sessionIdRaw);
  if (!parsed.ok) {
    return { confirmed: false };
  }
  const { sessionId } = parsed;
  if (!options.secretKey) {
    return { confirmed: false };
  }

  const retrieve =
    options.retrieve ??
    (async (id: string) => {
      const stripe = new Stripe(options.secretKey!);
      return stripe.checkout.sessions.retrieve(id);
    });

  const listLineItems =
    options.listLineItems ??
    (async (id: string) => {
      const stripe = new Stripe(options.secretKey!);
      return stripe.checkout.sessions.listLineItems(id, { limit: 100 });
    });

  try {
    const session = await retrieve(sessionId);
    if (session.status !== "complete") {
      return { confirmed: false };
    }

    const modeIsSubscription = session.mode === "subscription";
    let commerceAddon = false;

    if (!modeIsSubscription) {
      // Mirror portal API / webhook: entitlement from charged Commerce Price
      // IDs only. Never trust metadata.commerceAddon or metadata.tier on
      // payment mode (create path never emits payment+growth/complete).
      try {
        const lineItems = await listLineItems(sessionId);
        const resolved = resolveCommerceAddonFromLineItems({
          metadataCommerceAddon: session.metadata?.commerceAddon === "true",
          lineItemPriceIds: priceIdsFromStripeLineItems(lineItems.data),
          commercePrices: commerceAddonPriceIdsFromEnv(),
        });
        commerceAddon = resolved.commerceAddon;
        if (resolved.metadataMismatch) {
          console.warn(
            `checkout-success: session ${sessionId} commerceAddon metadata=${String(
              session.metadata?.commerceAddon === "true",
            )} lineItems=${String(commerceAddon)} — using line items`,
          );
        }
      } catch {
        // Fail closed: hide Manage billing rather than surface a CTA the
        // portal API would reject. Buyer can refresh; portal path returns 502.
        commerceAddon = false;
      }
    }

    const showBillingPortal = checkoutSessionEligibleForBillingPortal({
      mode: session.mode,
      commerceAddon,
    });
    return { confirmed: true, sessionId, showBillingPortal };
  } catch {
    return { confirmed: false };
  }
}
