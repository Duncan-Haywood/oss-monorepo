import { listOrdersByLeadSlug } from "@/lib/db";
import {
  checkoutSessionEligibleForBillingPortal,
  latestEligibleOrder,
  stripeCustomerIdFromUnknown,
} from "@/lib/billing/portal";
import { captureError } from "@/lib/observability/error-tracking";
import {
  commerceAddonPriceIdsFromEnv,
  priceIdsFromStripeLineItems,
  resolveCommerceAddonFromLineItems,
} from "@/lib/payments/commerce-addon-line-items";
import { isStripeCheckoutSessionPaid } from "@/lib/payments/checkout-payment-status";
import {
  catalogRecurringPriceIdsFromEnv,
  sessionLineItemsIncludeCatalogRecurringPrice,
} from "@/lib/payments/checkout-price-line-items";

export type BillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

type MinimalStripeCheckoutSession = {
  id?: string;
  customer: string | { id?: string } | null;
  status?: string | null;
  payment_status?: string | null;
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

/**
 * Create a Stripe Billing Portal session for a paid lead with a recurring plan.
 *
 * CRM `tier` / `commerceAddon` is only a fast filter (latestEligibleOrder) —
 * entitlement must re-prove the Checkout Session the same way as
 * createBillingPortalForCheckoutSession (payment_status paid + catalog
 * recurring / Commerce Prices on listLineItems). A stale or forged CRM row
 * must not mint Manage billing while the public Session path would 400.
 * Requires stripeSessionId; Session customer is preferred over stored CRM id.
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

  const sessionId = order.stripeSessionId?.trim() ?? "";
  if (!sessionId) {
    return {
      ok: false,
      error:
        "Could not resolve a Stripe Checkout Session for this order. Re-check the order in Stripe.",
      status: 404,
    };
  }

  // Reuse Session-path gates — never open portal from CRM fields alone.
  return createBillingPortalForCheckoutSession(stripe, sessionId, returnUrl);
}

/**
 * Customer self-serve path from /checkout/success — uses the completed Checkout Session.
 *
 * Requires payment_status === "paid" (same gate as webhook fulfillment +
 * loadCheckoutSuccessSession) — async ACH can leave status=complete with
 * payment_status unpaid; do not open Billing Portal before funds clear.
 *
 * When mode !== subscription, Starter + Commerce eligibility must derive
 * commerceAddon from listLineItems Price IDs (same helper as the bundle
 * webhook) — never from metadata.commerceAddon alone. A Dashboard-minted
 * payment-mode session with forged metadata could otherwise open Billing
 * Portal without the Commerce Prices on the charge.
 *
 * When mode === subscription, also require a create-path catalog recurring
 * Price ID (Growth/Complete/Commerce monthly env) on listLineItems —
 * mode alone is not enough (Dashboard-minted subscription with a foreign
 * Price must not open Manage billing).
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
    // Mirror webhook + success SSR: complete ≠ paid for async methods.
    if (!isStripeCheckoutSessionPaid(session.payment_status)) {
      return { ok: false, error: "Checkout session is not paid", status: 400 };
    }

    const modeIsSubscription = session.mode === "subscription";
    let commerceAddon = false;
    let catalogRecurringProven = false;

    // Always list line items for entitlement — subscription mode needs catalog
    // recurring Price proof; payment mode needs Commerce Price proof.
    // listLineItems failures → 502 so the customer can retry.
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(id, {
        limit: 100,
      });
      const lineItemPriceIds = priceIdsFromStripeLineItems(lineItems.data);

      if (modeIsSubscription) {
        catalogRecurringProven = sessionLineItemsIncludeCatalogRecurringPrice(
          lineItemPriceIds,
          catalogRecurringPriceIdsFromEnv(),
        );
      } else {
        // Never trust metadata.tier on payment mode — create path never emits
        // payment+growth/complete (hasRecurring).
        const resolved = resolveCommerceAddonFromLineItems({
          metadataCommerceAddon: session.metadata?.commerceAddon === "true",
          lineItemPriceIds,
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Stripe error";
      await captureError(error, {
        component: "billing-portal",
        failureKind: "line_items_verify",
      });
      return {
        ok: false,
        error: modeIsSubscription
          ? `Could not verify catalog recurring line items for billing portal: ${message}`
          : `Could not verify Commerce line items for billing portal: ${message}`,
        status: 502,
      };
    }

    const eligible = checkoutSessionEligibleForBillingPortal({
      mode: session.mode,
      commerceAddon,
      catalogRecurringProven,
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
    await captureError(error, {
      component: "billing-portal",
      failureKind: "session_create",
    });
    return { ok: false, error: message, status: 502 };
  }
}
