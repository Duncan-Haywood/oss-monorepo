import { listOrdersByLeadSlug } from "@/lib/db";
import type { OrderRecord } from "@/lib/orders/types";
import {
  checkoutSessionEligibleForBillingPortal,
  latestEligibleOrder,
  stripeCustomerIdFromUnknown,
} from "@/lib/billing/portal";
import {
  commerceAddonPriceIdsFromEnv,
  priceIdsFromStripeLineItems,
  resolveCommerceAddonFromLineItems,
} from "@/lib/payments/commerce-addon-line-items";

export type BillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

type MinimalStripeCheckoutSession = {
  id?: string;
  customer: string | { id?: string } | null;
  status?: string | null;
  mode?: string | null;
  metadata?: Record<string, string> | null;
};

type MinimalStripeLineItem = {
  price?: string | { id?: string | null } | null;
};

/**
 * Interface subset this module calls — matches the real Stripe SDK shape.
 * The Stripe client is passed in (not constructed here) so this stays unit
 * testable with a fake client — mirrors src/lib/commerce/stripe-sync.ts and
 * src/lib/pricing/bootstrap-stripe-prices.ts. Only the caller (dashboard
 * server action / API route) constructs `new Stripe(secretKey)` and gates on
 * STRIPE_SECRET_KEY — see create-portal-session.test.ts.
 */
export interface StripeBillingPortalClient {
  checkout: {
    sessions: {
      retrieve(id: string): Promise<MinimalStripeCheckoutSession>;
      listLineItems(
        id: string,
        params?: { limit?: number },
      ): Promise<{ data: MinimalStripeLineItem[] }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url: string | null }>;
    };
  };
}

async function resolveCustomerId(
  stripe: StripeBillingPortalClient,
  order: OrderRecord,
): Promise<string | null> {
  const stored = stripeCustomerIdFromUnknown(order.stripeCustomerId);
  if (stored) return stored;
  if (!order.stripeSessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    return stripeCustomerIdFromUnknown(session.customer);
  } catch {
    return null;
  }
}

/**
 * Create a Stripe Billing Portal session for a paid lead with a recurring plan.
 * Resolves customer id from the stored order, falling back to the Checkout Session.
 */
export async function createBillingPortalForLead(
  stripe: StripeBillingPortalClient,
  leadSlug: string,
  returnUrl: string,
): Promise<BillingPortalResult> {
  const slug = leadSlug.trim();
  if (!slug) {
    return { ok: false, error: "Lead slug is required", status: 400 };
  }

  // Slug-scoped — never full-ledger listOrders() for a single Manage-billing click.
  const orders = await listOrdersByLeadSlug(slug);
  const order = latestEligibleOrder(orders);
  if (!order) {
    return {
      ok: false,
      error:
        "No Growth/Complete/Commerce order found for this lead — Starter one-time payments have no billing portal.",
      status: 404,
    };
  }

  const customerId = await resolveCustomerId(stripe, order);
  if (!customerId) {
    return {
      ok: false,
      error:
        "Could not resolve a Stripe Customer for this order. Re-check the Checkout Session in Stripe.",
      status: 404,
    };
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!portal.url) {
      return { ok: false, error: "Stripe did not return a billing portal URL", status: 502 };
    }
    return { ok: true, url: portal.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    return { ok: false, error: message, status: 502 };
  }
}

/**
 * Customer self-serve path from /checkout/success — uses the completed Checkout Session.
 *
 * When mode !== subscription, Starter + Commerce eligibility must derive
 * commerceAddon from listLineItems Price IDs (same helper as the bundle
 * webhook) — never from metadata.commerceAddon alone. A Dashboard-minted
 * payment-mode session with forged metadata could otherwise open Billing
 * Portal without the Commerce Prices on the charge.
 */
export async function createBillingPortalForCheckoutSession(
  stripe: StripeBillingPortalClient,
  sessionId: string,
  returnUrl: string,
): Promise<BillingPortalResult> {
  const id = sessionId.trim();
  if (!id) {
    return { ok: false, error: "Checkout session id is required", status: 400 };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.status !== "complete") {
      return { ok: false, error: "Checkout session is not complete", status: 400 };
    }

    const modeIsSubscription = session.mode === "subscription";
    let commerceAddon = false;

    if (!modeIsSubscription) {
      // Mirror webhook: only entitlement from charged Commerce Price IDs.
      // listLineItems failures → 502 so the customer can retry (not a Stripe
      // webhook redelivery path). Never trust metadata.tier on payment mode —
      // create path never emits payment+growth/complete (hasRecurring).
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(id, {
          limit: 100,
        });
        const resolved = resolveCommerceAddonFromLineItems({
          metadataCommerceAddon: session.metadata?.commerceAddon === "true",
          lineItemPriceIds: priceIdsFromStripeLineItems(lineItems.data),
          commercePrices: commerceAddonPriceIdsFromEnv(),
        });
        commerceAddon = resolved.commerceAddon;
        if (resolved.metadataMismatch) {
          console.warn(
            `billing-portal: session ${id} commerceAddon metadata=${String(
              session.metadata?.commerceAddon === "true",
            )} lineItems=${String(commerceAddon)} — using line items`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Stripe error";
        return {
          ok: false,
          error: `Could not verify Commerce line items for billing portal: ${message}`,
          status: 502,
        };
      }
    }

    const eligible = checkoutSessionEligibleForBillingPortal({
      mode: session.mode,
      commerceAddon,
    });
    if (!eligible) {
      return {
        ok: false,
        error: "This checkout has no recurring subscription to manage",
        status: 400,
      };
    }

    const customerId = stripeCustomerIdFromUnknown(session.customer);
    if (!customerId) {
      return {
        ok: false,
        error: "Checkout session has no Stripe Customer (portal requires a customer)",
        status: 404,
      };
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!portal.url) {
      return { ok: false, error: "Stripe did not return a billing portal URL", status: 502 };
    }
    return { ok: true, url: portal.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    return { ok: false, error: message, status: 502 };
  }
}
