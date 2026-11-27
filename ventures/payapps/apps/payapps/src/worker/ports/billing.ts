// Billing port: packages/billing's BillingProvider (Paddle as merchant of record, or the signed fake
// in tests and the offline demo). Paid plans ship dark: with no provider configured this returns
// null, checkout answers 503 and every org stays on the Free plan (src/shared/plans.ts).
// Never commit a key; the BILLING_* values are owner-only secrets (docs/BILLING.md).
import { type BillingProvider, createBillingProvider as create } from "@billing";
import { catalog } from "@shared/plans";
import type { Env } from "../env";

export type { BillingProvider };

export function createBillingProvider(env: Env): BillingProvider | null {
  // The fake would accept any signed-by-the-public-secret webhook: never let it run in production.
  if (env.APP_ENV === "production" && env.FAKE_EXTERNALS === "true") {
    throw new Error("FAKE_EXTERNALS=true is not allowed in production");
  }
  return create(env, { planKeys: catalog.purchasableKeys });
}
