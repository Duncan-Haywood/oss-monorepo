/**
 * Optional /checkout?slug= prefill length gate.
 *
 * Contact / preview-open /preview/[slug] hard-reject over
 * MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH. Checkout slug is optional attribution —
 * hard-reject 400 would strand a buyer mid-purchase; soft-cap would change
 * the CRM lookup key. Treat over-long (and empty/whitespace) like missing:
 * fall back to an un-prefilling checkout (checkout-slug-prefill-field-length-cap).
 *
 * Defaults lazy-import `@/lib/db` so Vitest can exercise the pure length gate
 * without pulling the `server-only` db module.
 */

import { isPublicLeadSlugPathLengthOk } from "@/lib/leads/slug-path";
import type { Lead } from "@/lib/leads/types";
import type { OrderRecord } from "@/lib/orders/types";

export type CheckoutPrefillLeadDeps = {
  getLeadBySlug: (slug: string) => Promise<Lead | null>;
  listOrdersByLeadSlug: (slug: string) => Promise<OrderRecord[]>;
};

async function defaultDeps(): Promise<CheckoutPrefillLeadDeps> {
  const { getLeadBySlug, listOrdersByLeadSlug } = await import("@/lib/db");
  return { getLeadBySlug, listOrdersByLeadSlug };
}

/**
 * Trim and accept a checkout query slug only when it passes the shared
 * public lead-slug length gate. Over-long / empty → undefined (missing).
 */
export function resolveCheckoutPrefillSlug(
  raw: string | undefined | null,
): string | undefined {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!isPublicLeadSlugPathLengthOk(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export type CheckoutPrefillLeadResult = {
  /** Accepted query slug (or CRM canonical when found); undefined when missing/over-long. */
  slug: string | undefined;
  lead: Lead | null;
  /**
   * True when the lead already has any prior bundle order — mirrors POST
   * /api/stripe/checkout's own setup-fee-skip predicate exactly (see
   * checkout-setup-fee-skip-on-upgrade), so the "Due today" total the
   * checkout form displays never drifts from what Stripe will actually
   * charge. Only meaningful when `lead` resolved — a slug with no CRM lead
   * has no orders to have paid a setup fee against.
   */
  hasExistingOrder?: boolean;
};

/**
 * Resolve optional checkout prefill: length-gate before getLeadBySlug.
 * Over-long never burns CRM; returns { slug: undefined, lead: null }.
 */
export async function loadCheckoutPrefillLead(
  rawSlug: string | undefined | null,
  deps?: CheckoutPrefillLeadDeps,
): Promise<CheckoutPrefillLeadResult> {
  const slug = resolveCheckoutPrefillSlug(rawSlug);
  if (!slug) {
    return { slug: undefined, lead: null, hasExistingOrder: false };
  }
  const resolved = deps ?? (await defaultDeps());
  const lead = await resolved.getLeadBySlug(slug);
  const hasExistingOrder = lead
    ? (await resolved.listOrdersByLeadSlug(lead.slug)).length > 0
    : false;
  return { slug: lead?.slug ?? slug, lead, hasExistingOrder };
}
