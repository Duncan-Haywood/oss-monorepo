// Where the paid plans are sold. Every value is a public link or a public product id,
// never a secret. Each checkout link stays empty until the owner creates that hosted
// checkout product with the merchant of record (docs/PRICING.md); while a plan's link is
// empty the page shows no Buy button for it, and while every link is empty the paid path
// is dark and every feature stays open (plans.mjs `entitlement`).
export const CHECKOUT_URLS = {
  /** One-off "Job report" (docs/PRICING.md). */
  report: "",
  /** "Contractor suite" subscription: sold from the suite, not from this page, until it ships. */
  pro: "",
};
// Kept for the page's bid-package unlock, which sells the same Job report key.
export const CHECKOUT_URL = CHECKOUT_URLS.report;
// Lemon Squeezy's public licence validate call (form POST, no API key). Read from memory
// of its docs, not run against a live product: confirm before a checkout link is set.
export const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
// Merchant variant id (as text) -> plan key, filled in with the checkout links. A valid key
// whose variant is not listed here unlocks nothing (billing.mjs `planOf`).
export const VARIANT_PLANS = /** @type {Record<string, "report" | "pro">} */ ({});
