/**
 * Payment stub lead fields used when checkout completes for a slug that does
 * not yet exist in the CRM. SQLite recordLeadPayment creates a minimal paid
 * row; Convex markLeadPaid must insert a full lead document (schema requires
 * tagline/description/phone/services/hours/recommendedTier). Keep
 * `convex/leads.ts` markLeadPaid in sync with these defaults.
 */

export function businessNameFromPaymentSlug(slug: string): string {
  const name = slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return name || "Unknown";
}

/** Defaults matching mapSqliteRowToLead for a generic stub lead at paid stage. */
export function buildPaymentStubLeadFields(slug: string) {
  const businessName = businessNameFromPaymentSlug(slug);
  return {
    slug,
    businessName,
    category: "generic" as const,
    city: "Colorado",
    state: "CO",
    tagline: "Local favorites made fresh daily",
    description: `This is a preview page generated for ${businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
    phone: "(555) 000-0000",
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
