// Checkout price keys: how an app names the provider price for a plan + billing interval.
//   "starter"         -> starter, billed monthly
//   "starter:annual"  -> starter, billed yearly
// BILLING_PRICE_IDS (owner secret) maps these keys to Paddle price ids (pri_...).
import type { BillingInterval } from "./provider.ts";

export const checkoutPriceKey = (planKey: string, interval: BillingInterval) =>
  interval === "year" ? `${planKey}:annual` : planKey;

/**
 * Inverse of checkoutPriceKey. With `allowedPlanKeys`, only those plans parse (pass the app's
 * PURCHASABLE plan keys so a price can never map to a staff-only plan such as "comp").
 */
export function parseCheckoutPriceKey(
  key: string,
  allowedPlanKeys?: readonly string[],
): { planKey: string; interval: BillingInterval } | null {
  const [plan, suffix, ...rest] = key.split(":");
  if (!plan || rest.length) return null;
  if (allowedPlanKeys && !allowedPlanKeys.includes(plan)) return null;
  if (suffix !== undefined && suffix !== "annual") return null;
  return { planKey: plan, interval: suffix === "annual" ? "year" : "month" };
}

/** Parses the BILLING_PRICE_IDS secret (JSON object of price key -> price id). Bad input -> {}. */
export function parsePriceIds(raw: string | undefined | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0,
      ),
    );
  } catch {
    return {};
  }
}

/** Price keys missing from `priceIds` for the given purchasable plans (monthly + annual). */
export function missingPriceIds(
  priceIds: Record<string, string>,
  plans: readonly { key: string; annualPriceCents: number | null }[],
): string[] {
  const missing: string[] = [];
  for (const p of plans) {
    if (!priceIds[p.key]) missing.push(p.key);
    if (p.annualPriceCents !== null && !priceIds[checkoutPriceKey(p.key, "year")]) {
      missing.push(checkoutPriceKey(p.key, "year"));
    }
  }
  return missing;
}
