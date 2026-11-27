// Provider selection from environment variables / Worker bindings:
//   FAKE_EXTERNALS=true or APP_ENV=test        -> SignedFakeBillingProvider (verifies HMAC, no network)
//   BILLING_PROVIDER=paddle + BILLING_API_KEY + BILLING_WEBHOOK_SECRET -> PaddleBillingProvider
//   BILLING_PROVIDER unset or empty: defaults to "paddle" (owner, 2026-11-26: checkout turns
//     on by itself once the Paddle secrets exist) -- see billingProviderName()
//   BILLING_PROVIDER=none (or anything else)    -> null: an explicit kill switch
//   otherwise                                   -> null (checkout answers 503; comp plans keep working)
import { FAKE_WEBHOOK_SECRET, SignedFakeBillingProvider } from "./fake.ts";
import { PaddleBillingProvider } from "./paddle.ts";
import { parsePriceIds } from "./price-keys.ts";
import type { BillingProvider } from "./provider.ts";

/** The env/binding names this package reads. All BILLING_* values are owner-set secrets. */
export interface BillingEnv {
  FAKE_EXTERNALS?: string;
  APP_ENV?: string;
  BILLING_PROVIDER?: string;
  BILLING_API_KEY?: string;
  BILLING_WEBHOOK_SECRET?: string;
  BILLING_PRICE_IDS?: string;
}

export interface FactoryOptions {
  /** Purchasable plan keys (see PaddleOptions.planKeys). */
  planKeys?: readonly string[];
  /** Promo codes the fake provider accepts. */
  fakePromoCodes?: readonly string[];
  fetch?: typeof fetch;
}

/**
 * The provider to use: BILLING_PROVIDER when it is set, else "paddle" when both Paddle secrets
 * are present, else "none". Checkout used to ship switched off until the owner set
 * BILLING_PROVIDER=paddle; the owner lifted that gate on 2026-11-26, so the secrets alone turn it
 * on and an explicit BILLING_PROVIDER=none still turns it off.
 */
export function billingProviderName(
  env: Pick<BillingEnv, "BILLING_PROVIDER" | "BILLING_API_KEY" | "BILLING_WEBHOOK_SECRET">,
): string {
  const explicit = (env.BILLING_PROVIDER ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  return env.BILLING_API_KEY && env.BILLING_WEBHOOK_SECRET ? "paddle" : "none";
}

export function createBillingProvider(
  env: BillingEnv,
  opts: FactoryOptions = {},
): BillingProvider | null {
  if (env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test") {
    return new SignedFakeBillingProvider({
      secret: env.BILLING_WEBHOOK_SECRET || FAKE_WEBHOOK_SECRET,
      promoCodes: opts.fakePromoCodes,
    });
  }
  const provider = billingProviderName(env);
  if (provider === "paddle" && env.BILLING_API_KEY && env.BILLING_WEBHOOK_SECRET) {
    return new PaddleBillingProvider({
      apiKey: env.BILLING_API_KEY,
      webhookSecret: env.BILLING_WEBHOOK_SECRET,
      priceIds: parsePriceIds(env.BILLING_PRICE_IDS),
      planKeys: opts.planKeys,
      fetch: opts.fetch,
    });
  }
  return null;
}
