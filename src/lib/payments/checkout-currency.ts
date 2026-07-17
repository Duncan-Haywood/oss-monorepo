/**
 * Checkout create always charges USD Stripe Prices (bootstrap-stripe-prices +
 * commerce stripe-sync use currency: "usd"). Webhook amount↔catalog parity
 * compares minor units to USD cents, then divides by 100 into USD dollars —
 * so a non-USD session.currency must not reach the ledger even when
 * amount_total numerically equals the catalog cents.
 */

/** ISO-4217 lowercase code used by every sold Checkout create path. */
export const CHECKOUT_CURRENCY_USD = "usd" as const;

/**
 * True when Stripe Checkout Session.currency is USD (trim + case-insensitive).
 * Missing / non-string / blank / other currencies fail closed.
 */
export function isStripeCheckoutCurrencyUsd(currency: unknown): boolean {
  if (typeof currency !== "string") return false;
  return currency.trim().toLowerCase() === CHECKOUT_CURRENCY_USD;
}
