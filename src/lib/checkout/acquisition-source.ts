/**
 * Which marketing surface drove a bundle checkout — homepage pricing grid vs.
 * one of the three /websites-for-* SEO category landing pages. Fixed
 * allowlist, never free text: this value rides through an unauthenticated
 * client query param -> Stripe Checkout Session metadata -> the persisted
 * `orders` row an operator dashboard later renders, so a client-supplied
 * value must be validated against a closed set at every hop rather than
 * trusted as an opaque label (see acquisition-source-checkout-attribution).
 */
export const CHECKOUT_ACQUISITION_SOURCES = [
  "home",
  "cat-restaurant",
  "cat-salon",
  "cat-trades",
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
  }
}
