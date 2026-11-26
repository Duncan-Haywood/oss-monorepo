// Billing provider factory (OWNER: billing agent). Merchant of record: Paddle (see docs/PRICING.md).
//   FAKE_EXTERNALS / tests      -> SignedFakeBillingProvider (verifies HMAC signatures, no network)
//   BILLING_PROVIDER=paddle + BILLING_API_KEY + BILLING_WEBHOOK_SECRET -> PaddleBillingProvider
//   BILLING_PROVIDER=paddle + BILLING_API_KEY + BILLING_ENTITLEMENT_PRODUCT (AWS: webhooks go to the
//     payments sub-stack, services/billing/entitlement-sync.ts applies them) -> PaddleBillingProvider
//   otherwise                   -> null (billing endpoints answer 503; comp plans keep working)
import type { Env } from "../env";
import { FAKE_WEBHOOK_SECRET, SignedFakeBillingProvider } from "./billing/fake";
import { PaddleBillingProvider } from "./billing/paddle";
import type { BillingProvider } from "./billing-provider";

/** BILLING_PRICE_IDS: JSON map of checkout price key ("starter", "starter:annual", ...) -> price id. */
export function parsePriceIds(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function createBillingProvider(env: Env): BillingProvider | null {
  if (env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test") {
    return new SignedFakeBillingProvider(env.BILLING_WEBHOOK_SECRET || FAKE_WEBHOOK_SECRET);
  }
  const provider = (env.BILLING_PROVIDER ?? "").toLowerCase();
  const entitlementProduct = env.BILLING_ENTITLEMENT_PRODUCT?.trim() || undefined;
  if (
    provider === "paddle" &&
    env.BILLING_API_KEY &&
    (env.BILLING_WEBHOOK_SECRET || entitlementProduct)
  ) {
    return new PaddleBillingProvider({
      apiKey: env.BILLING_API_KEY,
      webhookSecret: env.BILLING_WEBHOOK_SECRET ?? "",
      priceIds: parsePriceIds(env.BILLING_PRICE_IDS),
      entitlementProduct,
    });
  }
  return null;
}
