/**
 * Payment stub lead fields used when checkout completes for a slug that does
 * not yet exist in the CRM. SQLite recordLeadPayment creates a minimal paid
 * row; Convex markLeadPaid must insert a full lead document (schema requires
 * tagline/description/phone/services/hours/recommendedTier). Keep
 * `convex/leads.ts` markLeadPaid in sync with these defaults.
 *
 * This record only ever exists for a customer we know almost nothing about, so
 * every field here is read by someone as a fact about their business — the
 * receipt email, the operator dashboard, and the customer's own preview page.
 *
 * It used to fabricate them. A homepage CTA mints an `organic-<hex>` slug
 * (organic-attribution.ts), and title-casing that produced a paying customer
 * called "Organic 8f3a2b1c9d4e", trading as "Local favorites made fresh daily"
 * on "(555) 000-0000" — a bakery slogan and a fictional phone number attached
 * to a real person who had just paid $500. Invented detail is worse than
 * absent detail here: absent detail reads as "we still need to ask you", and
 * fabricated detail reads as "we already got you wrong".
 *
 * So: take the buyer's own business name when checkout collected one, derive
 * from the slug only when the slug is a real CRM slug that a human named, and
 * otherwise say the details are pending. Never invent a trading identity.
 */

import { isOrganicCheckoutLeadSlug } from "@/lib/checkout/organic-attribution";

/** Shown wherever a paid customer has no name yet. Deliberately not a business name. */
export const PENDING_BUSINESS_NAME = "New customer (details pending)";

/**
 * Best available business name for a payment stub.
 *
 * `buyerBusinessName` is what the buyer typed at checkout and always wins.
 * A minted `organic-*` slug carries no information about the buyer, so it must
 * not be title-cased into one; a CRM slug was named by a human and can be.
 */
export function businessNameFromPaymentSlug(
  slug: string,
  buyerBusinessName?: string,
): string {
  const provided = buyerBusinessName?.trim();
  if (provided) return provided;

  if (isOrganicCheckoutLeadSlug(slug)) return PENDING_BUSINESS_NAME;

  const name = slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return name || PENDING_BUSINESS_NAME;
}

/**
 * Defaults for a generic stub lead at paid stage.
 *
 * Empty tagline/phone are intentional and load-bearing: the preview page and
 * dashboard render nothing for an empty field, which is the truth. Do not
 * reintroduce a placeholder here or in mapSqliteRowToLead's fallbacks.
 */
export function buildPaymentStubLeadFields(
  slug: string,
  buyerBusinessName?: string,
) {
  const businessName = businessNameFromPaymentSlug(slug, buyerBusinessName);
  return {
    slug,
    businessName,
    category: "generic" as const,
    city: "",
    state: "",
    tagline: "",
    description:
      "Created by a completed checkout before any business details were collected. The owner supplies these during onboarding.",
    phone: "",
    services: [] as string[],
    hours: {
      weekday: "",
      weekend: "",
    },
    stage: "paid" as const,
    recommendedTier: "growth" as const,
    dataSource: "payment_stub" as const,
  };
}
