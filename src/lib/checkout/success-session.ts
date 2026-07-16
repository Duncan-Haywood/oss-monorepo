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
 */

import Stripe from "stripe";
import { parseCheckoutSessionId } from "@/lib/billing/checkout-session-id";
import { orderEligibleForBillingPortal } from "@/lib/billing/portal";

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

/**
 * Parse + optionally retrieve. Over-long / missing session ids short-circuit
 * to unconfirmed without touching Stripe.
 */
export async function loadCheckoutSuccessSession(
  sessionIdRaw: string | undefined,
  options: {
    secretKey: string | undefined;
    retrieve?: RetrieveCheckoutSession;
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

  try {
    const session = await retrieve(sessionId);
    if (session.status !== "complete") {
      return { confirmed: false };
    }
    const tier = session.metadata?.tier ?? "";
    const commerceAddon = session.metadata?.commerceAddon === "true";
    const showBillingPortal =
      session.mode === "subscription" ||
      orderEligibleForBillingPortal({ tier, commerceAddon });
    return { confirmed: true, sessionId, showBillingPortal };
  } catch {
    return { confirmed: false };
  }
}
