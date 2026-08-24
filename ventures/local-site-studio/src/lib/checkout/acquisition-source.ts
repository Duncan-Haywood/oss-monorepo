/**
 * Which marketing surface drove a bundle checkout — homepage pricing grid,
 * one of the /websites-for-* SEO category landing pages, a lead's own
 * /preview/[slug] page (tier-upsell cards + hero "Claim this site" CTA), or
 * an outreach email (Email 1/2/3 + abandoned-checkout recovery nudges).
 * Fixed allowlist, never free text: this value rides through an
 * unauthenticated client query param -> Stripe Checkout Session metadata ->
 * the persisted `orders` row an operator dashboard later renders, so a
 * client-supplied value must be validated against a closed set at every hop
 * rather than trusted as an opaque label (see
 * acquisition-source-checkout-attribution).
 *
 * "preview" and "outreach-email" were added by
 * acquisition-source-preview-and-outreach-attribution after the original
 * four-token allowlist (homepage + the three SEO landing pages) shipped: the
 * lead's own preview page and the outreach-email sequence are this
 * cold-outbound business's dominant conversion path, and neither tagged its
 * checkout links, so most real revenue was bucketing under "Unknown /
 * direct" in acquisitionSourceBreakdown — the opposite of what that panel
 * exists to answer. "cat-retail" was added when the retail vertical's
 * /websites-for-retail landing page shipped (see
 * retail-category-landing-page in BUSINESS_DECISIONS) — every new
 * CATEGORY_LANDING_PAGES entry needs a matching token here or its CTA link
 * silently omits ?source= (see acquisitionSourceForCategory's fallback in
 * category-landing-content.tsx). "cat-health" was added the same way when
 * the health & wellness vertical's /websites-for-health landing page shipped
 * (see health-category-landing-page in BUSINESS_DECISIONS). "cat-automotive"
 * was added the same way when the automotive vertical's
 * /websites-for-automotive landing page shipped (see
 * automotive-category-landing-page in BUSINESS_DECISIONS). "cat-cleaning"
 * was added the same way when the cleaning-services vertical's
 * /websites-for-cleaning landing page shipped (see
 * cleaning-category-landing-page in BUSINESS_DECISIONS). "cat-fitness" was
 * added the same way when the fitness vertical's /websites-for-fitness
 * landing page shipped (see fitness-category-landing-page in
 * BUSINESS_DECISIONS). "cat-legal" was added the same way when the legal
 * vertical's /websites-for-legal landing page shipped (see
 * legal-category-landing-page in BUSINESS_DECISIONS). "nav" was added by
 * nav-header-checkout-cta-acquisition-source-fix: SiteHeader's "Get started"
 * button renders on every route (the single root layout.tsx mounts it
 * unconditionally) but linked to plain /checkout with no ?source= — every
 * click through this persistent, high-visibility CTA was silently bucketing
 * into "Unknown / direct" in acquisitionSourceBreakdown, undermining the
 * exact metric this allowlist exists to produce.
 */
export const CHECKOUT_ACQUISITION_SOURCES = [
  "home",
  "cat-restaurant",
  "cat-salon",
  "cat-trades",
  "cat-retail",
  "cat-health",
  "cat-automotive",
  "cat-cleaning",
  "cat-fitness",
  "cat-legal",
  "preview",
  "outreach-email",
  "nav",
] as const;

export type CheckoutAcquisitionSource = (typeof CHECKOUT_ACQUISITION_SOURCES)[number];

const ACQUISITION_SOURCE_SET: ReadonlySet<string> = new Set(CHECKOUT_ACQUISITION_SOURCES);

/**
 * Validates a client-supplied checkout acquisition-source value against the
 * fixed allowlist above. Returns undefined for anything else (missing,
 * unknown token, wrong type) rather than rejecting the checkout itself — this
 * is an optional attribution field (AGENT_PROTOCOL's request-field-size-
 * bounds class 3: optional attribution fields fall back to "no value" on
 * anything unexpected, never hard-reject the primary action).
 */
export function parseCheckoutAcquisitionSource(
  value: unknown,
): CheckoutAcquisitionSource | undefined {
  return typeof value === "string" && ACQUISITION_SOURCE_SET.has(value)
    ? (value as CheckoutAcquisitionSource)
    : undefined;
}

/** Human-readable label for dashboard display. */
export function checkoutAcquisitionSourceLabel(source: CheckoutAcquisitionSource): string {
  switch (source) {
    case "home":
      return "Homepage";
    case "cat-restaurant":
      return "Restaurants landing page";
    case "cat-salon":
      return "Salons landing page";
    case "cat-trades":
      return "Trades landing page";
    case "cat-retail":
      return "Retail landing page";
    case "cat-health":
      return "Health & wellness landing page";
    case "cat-automotive":
      return "Automotive landing page";
    case "cat-cleaning":
      return "Cleaning services landing page";
    case "cat-fitness":
      return "Fitness landing page";
    case "cat-legal":
      return "Legal landing page";
    case "preview":
      return "Lead preview page";
    case "outreach-email":
      return "Outreach email";
    case "nav":
      return "Site header nav";
  }
}
