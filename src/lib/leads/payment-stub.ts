/**
 * Payment stub lead fields used when checkout completes for a slug that does
 * not yet exist in the CRM. SQLite recordLeadPayment creates a minimal paid
 * row; Convex markLeadPaid must insert a full lead document (schema requires
 * tagline/description/phone/services/hours/recommendedTier). Keep
 * `convex/leads.ts` markLeadPaid in sync with these defaults.
 */

import { defaultTagline } from "./default-tagline";

export function businessNameFromPaymentSlug(slug: string): string {
  const name = slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return name || "Unknown";
}

/**
 * Defaults matching mapSqliteRowToLead for a generic stub lead at paid stage.
 *
 * `overrides` lets a real checkout-time businessName/phone (collected on the
 * organic no-preexisting-lead path — see checkout-business-fields-capture)
 * replace the derived placeholders below, so a paying customer's receipt/
 * go-live emails and CRM row use what they actually typed instead of a
 * title-cased slug ("Organic A1b2c3") and a fake phone number. Falls back to
 * the existing derived defaults when omitted/blank — zero behavior change
 * for every other caller (CSV import, demo leads, buyers who skip the field).
 */
export function buildPaymentStubLeadFields(
  slug: string,
  overrides?: { businessName?: string; phone?: string },
) {
  const businessName = overrides?.businessName || businessNameFromPaymentSlug(slug);
  return {
    slug,
    businessName,
    category: "generic" as const,
    city: "Colorado",
    state: "CO",
    tagline: defaultTagline("generic"),
    description: `This is a preview page generated for ${businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
    phone: overrides?.phone || "(555) 000-0000",
    services: [] as string[],
    hours: {
      weekday: "Mon–Fri 9am–5pm",
      weekend: "Sat–Sun Closed",
    },
    stage: "paid" as const,
    recommendedTier: "growth" as const,
    dataSource: "payment_stub" as const,
  };
}
