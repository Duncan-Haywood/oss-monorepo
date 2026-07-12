import "server-only";

import Stripe from "stripe";
import { listOrders } from "@/lib/db";
import type { OrderRecord } from "@/lib/orders/types";
import {
  latestEligibleOrder,
  orderEligibleForBillingPortal,
  stripeCustomerIdFromUnknown,
} from "@/lib/billing/portal";

export type BillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

function stripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

async function resolveCustomerId(
  stripe: Stripe,
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
  leadSlug: string,
  returnUrl: string,
): Promise<BillingPortalResult> {
  const slug = leadSlug.trim();
  if (!slug) {
    return { ok: false, error: "Lead slug is required", status: 400 };
  }

  const stripe = stripeClient();
  if (!stripe) {
    return {
      ok: false,
      error: "Set STRIPE_SECRET_KEY before opening the billing portal.",
      status: 501,
    };
  }

  const orders = (await listOrders()).filter((o) => o.leadSlug === slug);
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
 */
export async function createBillingPortalForCheckoutSession(
  sessionId: string,
  returnUrl: string,
): Promise<BillingPortalResult> {
  const id = sessionId.trim();
  if (!id) {
    return { ok: false, error: "Checkout session id is required", status: 400 };
  }

  const stripe = stripeClient();
  if (!stripe) {
    return {
      ok: false,
      error: "Set STRIPE_SECRET_KEY before opening the billing portal.",
      status: 501,
    };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.status !== "complete") {
      return { ok: false, error: "Checkout session is not complete", status: 400 };
    }

    const tier = session.metadata?.tier ?? "";
    const commerceAddon = session.metadata?.commerceAddon === "true";
    const modeIsSubscription = session.mode === "subscription";
    const eligible =
      modeIsSubscription ||
      orderEligibleForBillingPortal({ tier, commerceAddon });

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
