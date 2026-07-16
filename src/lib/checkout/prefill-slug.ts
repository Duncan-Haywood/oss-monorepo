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

export type CheckoutPrefillLeadDeps = {
  getLeadBySlug: (slug: string) => Promise<Lead | null>;
};

async function defaultDeps(): Promise<CheckoutPrefillLeadDeps> {
  const { getLeadBySlug } = await import("@/lib/db");
  return { getLeadBySlug };
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
    return { slug: undefined, lead: null };
  }
  const resolved = deps ?? (await defaultDeps());
  const lead = await resolved.getLeadBySlug(slug);
  return { slug: lead?.slug ?? slug, lead };
}
