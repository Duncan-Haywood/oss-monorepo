"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  nextClientIdempotencyKey,
  type ClientIdempotencyAttempt,
} from "@/lib/checkout/idempotency-key";
import type { CheckoutAcquisitionSource } from "@/lib/checkout/acquisition-source";
import { checkoutDueTodaySubtitle, checkoutSetupFeeTotal } from "@/lib/checkout/due-today";
import { leadPreviewPath } from "@/lib/leads/slug-path";
import {
  annualBillingSavingsUsd,
  BUNDLES,
  COMMERCE_ADDON,
  type BundleBillingInterval,
  type BundleTier,
} from "@/lib/pricing/bundles";

export interface CheckoutPrefill {
  slug?: string;
  businessName?: string;
  email?: string;
  recommendedTier?: BundleTier;
  initialTier?: BundleTier;
  initialCommerce?: boolean;
  /** "annual" only when explicitly requested (e.g. a cancelled-checkout
   * round trip) — every other value behaves as "monthly", the long-standing
   * default. See parseBundleBillingInterval's identical fallback. */
  initialBillingInterval?: BundleBillingInterval;
  /** Which marketing surface (homepage / a category landing page) sent this
   * shopper to Checkout — already validated against a fixed allowlist by
   * parseCheckoutAcquisitionSource before this prop is set (checkout/page.tsx
   * is the only caller). Captured once from the initial page load, not a
   * user-editable form field — see acquisition-source-checkout-attribution. */
  acquisitionSource?: CheckoutAcquisitionSource;
  /** True when the lead already has any prior bundle order — see
   * checkout-setup-fee-skip-on-upgrade and due-today.ts. Mirrors the exact
   * server-side predicate so this page never quotes a setup fee Stripe
   * won't actually charge. */
  hasExistingOrder?: boolean;
}

function parseTier(value: string | undefined): BundleTier {
  if (value === "starter" || value === "growth" || value === "complete") {
    return value;
  }
  return "starter";
}

export function CheckoutForm({ prefill }: { prefill: CheckoutPrefill }) {
  const slug = prefill.slug;
  const [tier, setTierState] = useState<BundleTier>(() =>
    parseTier(prefill.initialTier ?? prefill.recommendedTier),
  );
  // Starter has no recurring price in either cadence — switching to it while
  // Annual is selected would leave the toggle showing a now-meaningless
  // selection (harmless financially, since Starter never adds a recurring
  // line item regardless of billingInterval, but confusing to look at).
  function setTier(next: BundleTier) {
    setTierState(next);
    if (next === "starter") setBillingIntervalState("monthly");
  }
  const [commerceAddon, setCommerceAddonState] = useState(prefill.initialCommerce === true);
  const [billingInterval, setBillingIntervalState] = useState<BundleBillingInterval>(
    prefill.initialBillingInterval === "annual" ? "annual" : "monthly",
  );
  // Annual billing and the Commerce add-on can't be combined yet (see
  // POST /api/stripe/checkout's own rejection of that combination) — a
  // single Stripe subscription's recurring line items must share one billing
  // interval, and the add-on has no annual Price of its own. Keep the two
  // controls mutually exclusive in the UI itself rather than only rejecting
  // the combination server-side after a redirect to Stripe.
  function setCommerceAddon(next: boolean) {
    setCommerceAddonState(next);
    if (next) setBillingIntervalState("monthly");
  }
  function setBillingInterval(next: BundleBillingInterval) {
    setBillingIntervalState(next);
    if (next === "annual") setCommerceAddonState(false);
  }
  const [email, setEmail] = useState(prefill.email ?? "");
  // Only ever shown when there's no existing CRM lead to prefill from (see
  // the businessName-conditional block below) — a real lead's name/phone
  // already live in the CRM, and letting a buyer overwrite them here would
  // let anonymous checkout traffic edit someone else's record.
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused across a same-params retry (network error, re-click) so it
  // collapses to one Stripe Checkout Session; a fresh key mints whenever the
  // shopper changes tier/commerce/email before retrying — see
  // idempotency-key.ts for why this can't be a stable server-derived key.
  const idempotencyAttemptRef = useRef<ClientIdempotencyAttempt | null>(null);

  const bundle = BUNDLES.find((b) => b.id === tier)!;
  const canBillAnnually = bundle.annualPriceUsd != null;
  const recurringUsd = billingInterval === "annual" ? bundle.annualPriceUsd : bundle.monthlyPriceUsd;
  const annualSavingsUsd = annualBillingSavingsUsd(bundle);
  const setupFeeWaived = prefill.hasExistingOrder === true;
  const setupTotal = checkoutSetupFeeTotal(bundle, commerceAddon, setupFeeWaived);
  // Commerce add-on is monthly-only (see setBillingInterval above) — its
  // contribution to "due today" always uses its own monthly price regardless
  // of the selected bundle billingInterval.
  const recurringTotal = (recurringUsd ?? 0) + (commerceAddon ? COMMERCE_ADDON.monthlyPriceUsd : 0);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const requestBody: Record<string, unknown> = {
        tier,
        commerceAddon,
        billingInterval,
        customerEmail: email || undefined,
        slug,
        acquisitionSource: prefill.acquisitionSource,
        ...(prefill.businessName
          ? {}
          : { businessName: businessName || undefined, businessPhone: businessPhone || undefined }),
      };
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        const attempt = nextClientIdempotencyKey(
          JSON.stringify(requestBody),
          idempotencyAttemptRef.current,
          () => crypto.randomUUID(),
        );
        idempotencyAttemptRef.current = attempt;
        requestBody.idempotencyKey = attempt.idempotencyKey;
      }
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        setError(data.message ?? data.error ?? "Checkout failed");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      {prefill.businessName ? (
        <p className="mt-3 text-zinc-600">
          Claiming <span className="font-medium text-zinc-900">{prefill.businessName}</span>
          {slug ? (
            <>
              {" "}
              (
              <Link
                href={leadPreviewPath(slug)}
                className="underline underline-offset-2"
              >
                preview
              </Link>
              )
            </>
          ) : null}
          . Choose your bundle — details on the{" "}
          <Link href="/docs/product-bundles" className="underline">
            product bundles
          </Link>{" "}
          page.
        </p>
      ) : (
        <p className="mt-3 text-zinc-600">
          Choose your bundle. See details on the{" "}
          <Link href="/docs/product-bundles" className="underline">
            product bundles
          </Link>{" "}
          page.
        </p>
      )}

      <div className="mt-8 space-y-3">
        <fieldset className="m-0 flex items-center gap-2 border-0 p-0">
          <legend className="sr-only">Billing interval</legend>
          <span className="text-sm font-medium text-zinc-700">Billing:</span>
          <div className="inline-flex rounded-full border border-zinc-300 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`rounded-full px-3 py-1 ${
                billingInterval === "monthly" ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("annual")}
              disabled={!canBillAnnually}
              className={`rounded-full px-3 py-1 disabled:cursor-not-allowed disabled:text-zinc-300 ${
                billingInterval === "annual" ? "bg-zinc-900 text-white" : "text-zinc-600"
              }`}
            >
              Annual
              {annualSavingsUsd ? ` (save $${annualSavingsUsd}/yr)` : ""}
            </button>
          </div>
        </fieldset>

        <fieldset className="m-0 space-y-3 border-0 p-0">
          <legend className="sr-only">Choose your bundle</legend>
          {BUNDLES.map((b) => (
            <label
              key={b.id}
              className={`block cursor-pointer rounded-2xl border p-4 ${
                tier === b.id ? "border-zinc-900" : "border-zinc-200"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="tier"
                    value={b.id}
                    checked={tier === b.id}
                    onChange={() => setTier(b.id)}
                  />
                  <span>
                    <span className="font-medium">{b.name}</span>
                    {prefill.recommendedTier === b.id ? (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                        Recommended
                      </span>
                    ) : null}
                    <span className="block text-xs text-zinc-500">{b.tagline}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm text-zinc-600">
                  ${b.setupPriceUsd}
                  {billingInterval === "annual" && b.annualPriceUsd
                    ? ` + $${b.annualPriceUsd}/yr`
                    : b.monthlyPriceUsd
                      ? ` + $${b.monthlyPriceUsd}/mo`
                      : ""}
                </span>
              </span>
              {tier === b.id ? (
                <ul className="mt-3 space-y-1.5 pl-7 text-sm text-zinc-700">
                  {b.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="text-zinc-500">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
          ))}
        </fieldset>

        <label
          className={`flex items-center justify-between rounded-2xl border border-dashed border-zinc-300 p-4 ${
            billingInterval === "annual" ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <span className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={commerceAddon}
              disabled={billingInterval === "annual"}
              onChange={(e) => setCommerceAddon(e.target.checked)}
            />
            <span className="font-medium">{COMMERCE_ADDON.name}</span>
          </span>
          <span className="text-sm text-zinc-600">
            +${COMMERCE_ADDON.setupPriceUsd} + ${COMMERCE_ADDON.monthlyPriceUsd}/mo
          </span>
        </label>
        {billingInterval === "annual" ? (
          <p className="text-xs text-zinc-500">
            The Commerce add-on is monthly-only for now — switch to Monthly billing above to add it.
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-zinc-700" htmlFor="email">
          Email {prefill.email ? "(from your preview lead)" : "(optional — prefills Stripe)"}
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      {prefill.businessName ? null : (
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700" htmlFor="businessName">
              Business name (optional)
            </label>
            <input
              id="businessName"
              type="text"
              name="businessName"
              autoComplete="organization"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Riverside Plumbing"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Helps us set up your CRM record and address your receipt correctly.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700" htmlFor="businessPhone">
              Business phone (optional)
            </label>
            <input
              id="businessPhone"
              type="tel"
              name="businessPhone"
              autoComplete="tel"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              placeholder="(555) 555-0100"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Due today</p>
            <p className="text-sm text-zinc-500">
              {checkoutDueTodaySubtitle({ recurringTotal, billingInterval, setupFeeWaived })}
            </p>
          </div>
          <p className="text-2xl font-semibold">${setupTotal + recurringTotal}</p>
        </div>
        {recurringTotal > 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Then ${recurringTotal}/{billingInterval === "annual" ? "yr" : "mo"} starting{" "}
            {billingInterval === "annual" ? "next year" : "next month"}.
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          className="mt-6 h-12 w-full rounded-full bg-zinc-900 font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading ? "Redirecting to Stripe…" : "Continue to Stripe"}
        </button>

        {error ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-4 space-y-1 text-xs text-zinc-500">
          <li>Secure payment powered by Stripe.</li>
          <li>Preview first — pay only when you are ready to claim the site.</li>
          {recurringTotal > 0 ? (
            <li>
              Cancel anytime after the first {billingInterval === "annual" ? "year" : "month"}.
            </li>
          ) : (
            <li>One-time payment — no recurring charge.</li>
          )}
        </ul>
      </div>
    </>
  );
}
