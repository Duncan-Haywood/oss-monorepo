// Billing port: packages/billing's BillingProvider (Paddle as merchant of record, or the signed fake
// in tests and the offline demo). Paid plans ship dark: with no provider configured this returns
// null, checkout answers 503 and every org stays on the Free plan (src/shared/plans.ts).
// Never commit a key; the BILLING_* values are owner-only secrets (docs/BILLING.md).
import { type BillingProvider, createBillingProvider as create, isClientToken } from "@billing";
import { catalog } from "@shared/plans";
import type { Env } from "../env";

export type { BillingProvider };

export function createBillingProvider(env: Env): BillingProvider | null {
  // The fake would accept any signed-by-the-public-secret webhook: never let it run in production.
  if (env.APP_ENV === "production" && env.FAKE_EXTERNALS === "true") {
    throw new Error("FAKE_EXTERNALS=true is not allowed in production");
  }
  const provider = create(env, { planKeys: catalog.purchasableKeys });
  // A Paddle checkout opens on /pay, which needs the client-side token for Paddle.js: without it,
  // keep checkout off rather than send a buyer to a page that cannot take the payment.
  const paddle = (env.BILLING_PROVIDER ?? "").toLowerCase() === "paddle";
  const fake = env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test";
  if (provider && paddle && !fake && !isClientToken(env.BILLING_CLIENT_TOKEN)) return null;
  return provider;
}
