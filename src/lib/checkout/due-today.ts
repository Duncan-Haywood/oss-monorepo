/**
 * Pure "Due today" total + subtitle logic for CheckoutForm — extracted so it
 * can be unit-tested in the normal node Vitest environment (this repo has no
 * jsdom/@testing-library/react render-test infra; see leads-client-pending-
 * announcement-deferred-needs-rtl-infra for the established precedent of
 * extracting client-component arithmetic/copy logic into a plain function
 * rather than needing a DOM to prove it).
 *
 * setupFeeWaived mirrors POST /api/stripe/checkout's own setup-fee-skip
 * predicate exactly (see checkout-setup-fee-skip-on-upgrade): true when the
 * lead already has any prior bundle order, since every tier shares the same
 * one-time setup fee. Before this module existed, CheckoutForm always
 * charged/quoted the full setup fee regardless of prior orders, so an
 * upgrading customer following the Starter/Growth upsell email's "setup is
 * already covered" promise saw a contradicting price on this exact page.
 */

import { COMMERCE_ADDON, type BundleBillingInterval, type BundleDefinition } from "@/lib/pricing/bundles";

/** The one-time portion of "Due today" — 0 for the bundle setup fee when waived, the Commerce add-on setup fee is never waived. */
export function checkoutSetupFeeTotal(
  bundle: BundleDefinition,
  commerceAddon: boolean,
  setupFeeWaived: boolean,
): number {
  return (setupFeeWaived ? 0 : bundle.setupPriceUsd) + (commerceAddon ? COMMERCE_ADDON.setupPriceUsd : 0);
}

/** The subtitle under "Due today" — reflects whether the bundle setup fee is being charged this time. */
export function checkoutDueTodaySubtitle(params: {
  recurringTotal: number;
  billingInterval: BundleBillingInterval;
  setupFeeWaived: boolean;
}): string {
  const { recurringTotal, billingInterval, setupFeeWaived } = params;
  if (setupFeeWaived) {
    if (recurringTotal <= 0) return "Nothing due today — setup already covered";
    return billingInterval === "annual"
      ? "First year only — setup already covered"
      : "First month only — setup already covered";
  }
  if (recurringTotal > 0) {
    return billingInterval === "annual" ? "Setup fee + first year" : "Setup fee + first month";
  }
  return "Setup fee, one-time";
}
