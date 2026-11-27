// Provider selection from environment variables / Worker bindings:
//   FAKE_EXTERNALS=true or APP_ENV=test        -> SignedFakeBillingProvider (verifies HMAC, no network)
//   BILLING_PROVIDER=paddle + BILLING_API_KEY + BILLING_WEBHOOK_SECRET -> PaddleBillingProvider
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
  const provider = (env.BILLING_PROVIDER ?? "").toLowerCase();
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
