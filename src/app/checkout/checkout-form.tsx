"use client";

import Link from "next/link";
import { useState } from "react";
import { leadPreviewPath } from "@/lib/leads/slug-path";
import { BUNDLES, COMMERCE_ADDON, type BundleTier } from "@/lib/pricing/bundles";

export interface CheckoutPrefill {
  slug?: string;
  businessName?: string;
  email?: string;
  recommendedTier?: BundleTier;
  initialTier?: BundleTier;
  initialCommerce?: boolean;
}

function parseTier(value: string | undefined): BundleTier {
  if (value === "starter" || value === "growth" || value === "complete") {
    return value;
  }
  return "starter";
}

export function CheckoutForm({ prefill }: { prefill: CheckoutPrefill }) {
  const slug = prefill.slug;
  const [tier, setTier] = useState<BundleTier>(() =>
    parseTier(prefill.initialTier ?? prefill.recommendedTier),
  );
  const [commerceAddon, setCommerceAddon] = useState(prefill.initialCommerce === true);
  const [email, setEmail] = useState(prefill.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bundle = BUNDLES.find((b) => b.id === tier)!;
  const setupTotal = bundle.setupPriceUsd + (commerceAddon ? COMMERCE_ADDON.setupPriceUsd : 0);
  const monthlyTotal =
    (bundle.monthlyPriceUsd ?? 0) + (commerceAddon ? COMMERCE_ADDON.monthlyPriceUsd : 0);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          commerceAddon,
          customerEmail: email || undefined,
          slug,
        }),
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
        {BUNDLES.map((b) => (
          <label
            key={b.id}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 ${
              tier === b.id ? "border-zinc-900" : "border-zinc-200"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="tier"
                value={b.id}
                checked={tier === b.id}
                onChange={() => setTier(b.id)}
              />
              <span className="font-medium">{b.name}</span>
              {prefill.recommendedTier === b.id ? (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Recommended
                </span>
              ) : null}
            </span>
            <span className="text-sm text-zinc-600">
              ${b.setupPriceUsd}
              {b.monthlyPriceUsd ? ` + $${b.monthlyPriceUsd}/mo` : ""}
            </span>
          </label>
        ))}

        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-zinc-300 p-4">
          <span className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={commerceAddon}
              onChange={(e) => setCommerceAddon(e.target.checked)}
            />
            <span className="font-medium">{COMMERCE_ADDON.name}</span>
          </span>
          <span className="text-sm text-zinc-600">
            +${COMMERCE_ADDON.setupPriceUsd} + ${COMMERCE_ADDON.monthlyPriceUsd}/mo
          </span>
        </label>
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-zinc-700" htmlFor="email">
          Email {prefill.email ? "(from your preview lead)" : "(optional — prefills Stripe)"}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Due today</p>
            <p className="text-sm text-zinc-500">
              {monthlyTotal > 0 ? "Setup fee + first month" : "Setup fee, one-time"}
            </p>
          </div>
          <p className="text-2xl font-semibold">${setupTotal + monthlyTotal}</p>
        </div>
        {monthlyTotal > 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Then ${monthlyTotal}/mo starting next month.</p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          className="mt-6 h-12 w-full rounded-full bg-zinc-900 font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading ? "Redirecting to Stripe…" : "Continue to Stripe"}
        </button>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <ul className="mt-4 space-y-1 text-xs text-zinc-500">
          <li>Secure payment powered by Stripe.</li>
          <li>Preview first — pay only when you are ready to claim the site.</li>
          <li>Cancel anytime on Growth / Complete after the first month.</li>
        </ul>
      </div>
    </>
  );
}
