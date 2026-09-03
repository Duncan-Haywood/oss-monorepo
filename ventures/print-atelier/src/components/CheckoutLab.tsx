"use client";

import {
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  buildFulfillmentRoute,
  buildSampleCheckoutCart,
  calculateCheckoutTotals,
  formatCheckoutCurrency,
  loadCheckoutCartFromStorage,
  saveCheckoutCartToStorage,
  updateCheckoutLineQuantity,
  type CheckoutEnvStatus,
  type CheckoutLineItem,
  type CheckoutShippingRegion,
} from "@/lib/checkout";
import { catalogArtworks } from "@/lib/marketplace";
import { recordUsageEvent } from "@/lib/usage";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Package,
  ShieldAlert,
  Truck,
} from "lucide-react";

type CheckoutApiResponse = CheckoutEnvStatus & {
  session?: ReturnType<typeof buildCheckoutSessionPayload>;
  simulated?: boolean;
  hint?: string;
  checkoutUrl?: string;
  sessionId?: string;
  livemode?: boolean;
  error?: string;
};

const regions: CheckoutShippingRegion[] = ["US", "EU", "UK", "APAC"];

export default function CheckoutLab() {
  const [cart, setCart] = useState<CheckoutLineItem[]>([]);
  const [region, setRegion] = useState<CheckoutShippingRegion>("US");
  const [envStatus, setEnvStatus] = useState<CheckoutEnvStatus | null>(null);
  const [sessionPreview, setSessionPreview] = useState<CheckoutApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = loadCheckoutCartFromStorage();
    setCart(stored.length > 0 ? stored : buildSampleCheckoutCart());
  }, []);

  useEffect(() => {
    saveCheckoutCartToStorage(cart);
  }, [cart]);

  useEffect(() => {
    fetch("/api/stripe/checkout")
      .then((response) => response.json())
      .then((data) => setEnvStatus(data as CheckoutEnvStatus))
      .catch(() => setEnvStatus(null));
  }, []);

  const totals = useMemo(() => calculateCheckoutTotals(cart, region), [cart, region]);
  const route = useMemo(() => buildFulfillmentRoute(cart, region), [cart, region]);
  const readiness = useMemo(() => {
    const base = buildCheckoutReadiness(cart, catalogArtworks);
    const envBlockers = envStatus?.blockers ?? ["Stripe env status unavailable"];
    return {
      ...base,
      envReady: envStatus?.readyForTestCheckout ?? false,
      blockers: [...base.blockers.filter((b) => !b.includes("STRIPE")), ...envBlockers],
    };
  }, [cart, envStatus]);

  const addEligiblePrint = useCallback(() => {
    const sample = buildSampleCheckoutCart()[0];
    if (!sample) return;
    if (cart.some((item) => item.artworkSlug === sample.artworkSlug)) return;
    setCart((prev) => [...prev, sample]);
  }, [cart]);

  const removeLine = useCallback((slug: string) => {
    recordUsageEvent("checkout_remove");
    setCart((prev) => prev.filter((item) => item.artworkSlug !== slug));
  }, []);

  const changeQuantity = useCallback((slug: string, quantity: number) => {
    recordUsageEvent(quantity > 0 ? "checkout_quantity_change" : "checkout_remove");
    setCart((prev) => updateCheckoutLineQuantity(prev, slug, quantity));
  }, []);

  const resetCart = useCallback(() => {
    const sample = buildSampleCheckoutCart();
    setCart(sample);
    saveCheckoutCartToStorage(sample);
  }, []);

  const createSession = useCallback(async () => {
    setLoading(true);
    setSessionPreview(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineItems: cart, region }),
      });
      const data = (await response.json()) as CheckoutApiResponse;
      if (data.checkoutUrl && !data.simulated) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setSessionPreview(data);
    } finally {
      setLoading(false);
    }
  }, [cart, region]);

  return (
    <div className="space-y-8">
      <header className="border-b border-stone-200 pb-6">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
          Buyer · Phase 2 prep
        </p>
        <h1 className="text-3xl font-bold mt-1 text-stone-900 dark:text-stone-500">Checkout Lab</h1>
        <p className="text-stone-600 dark:text-stone-400 mt-2 max-w-3xl">
          Consent-gated cart → Stripe Checkout session → POD fulfillment routing → Connect artist
          transfer. Cart persists in localStorage until Convex order records ship.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-400">
              Cart ({cart.reduce((count, item) => count + item.quantity, 0)})
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addEligiblePrint}
                className="text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-gray-700 text-stone-900 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-gray-800"
              >
                Add eligible print
              </button>
              <button
                type="button"
                onClick={resetCart}
                className="text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-gray-700 text-stone-900 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-gray-800"
              >
                Reset sample
              </button>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500 dark:text-stone-400">
              <p>Cart empty - add a consent-cleared listing from the storefront.</p>
              <Link
                href="/storefront"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
              >
                Browse available prints <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {cart.map((item) => (
                <li
                  key={item.artworkSlug}
                  className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">{item.title}</p>
                    <p className="text-sm text-stone-500">{item.artistName}</p>
                    <p className="text-sm font-medium text-stone-800 mt-1">
                      {formatCheckoutCurrency(item.retailPrice * item.quantity)} total
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center rounded-lg border border-stone-200" aria-label={`Quantity for ${item.title}`}>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.artworkSlug, item.quantity - 1)}
                        aria-label={`Decrease ${item.title} quantity`}
                        className="px-2.5 py-1.5 text-lg text-stone-700 hover:bg-stone-100"
                      >
                        -
                      </button>
                      <span className="min-w-8 text-center text-sm font-medium text-stone-800">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.artworkSlug, item.quantity + 1)}
                        aria-label={`Increase ${item.title} quantity`}
                        className="px-2.5 py-1.5 text-lg text-stone-700 hover:bg-stone-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(item.artworkSlug)}
                      className="text-sm text-rose-600 hover:text-rose-800"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <label className="text-xs font-medium text-stone-500 uppercase">Ship to</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {regions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegion(r)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    region === r
                      ? "bg-stone-900 text-white"
                      : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-stone-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Order summary
            </h3>
            <dl className="mt-4 space-y-2 text-sm text-stone-900">
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd>{formatCheckoutCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Shipping est.</dt>
                <dd>{formatCheckoutCurrency(totals.shippingEstimate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Tax est.</dt>
                <dd>{formatCheckoutCurrency(totals.taxEstimate)}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold">
                <dt>Total</dt>
                <dd>{formatCheckoutCurrency(totals.total)}</dd>
              </div>
              <div className="flex justify-between text-emerald-700">
                <dt>Artist transfers</dt>
                <dd>{formatCheckoutCurrency(totals.artistTransfers)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5">
            <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
              <Truck className="w-4 h-4" /> Fulfillment route
            </h3>
            <p className="text-sm text-indigo-800 mt-2 font-medium">{route.partnerName}</p>
            <p className="text-xs text-indigo-700 mt-1">{route.reason}</p>
            <p className="text-xs text-indigo-600 mt-2">
              {route.shipDaysMin}–{route.shipDaysMax} business days to {route.region}
            </p>
          </div>

          <button
            type="button"
            onClick={createSession}
            disabled={loading || cart.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {loading ? "Creating session…" : "Create Stripe Checkout session"}
            <ArrowRight className="w-4 h-4" />
          </button>

          <Link
            href="/storefront"
            className="block text-center text-sm text-stone-500 dark:text-stone-400 hover:text-stone-800"
          >
            ← Back to storefront
          </Link>
        </aside>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h3 className="font-semibold text-stone-900 flex items-center gap-2">
          {readiness.blockers.length === 0 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          )}
          Checkout readiness
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              readiness.cartEligible ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            Cart {readiness.cartEligible ? "eligible" : "blocked"}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              readiness.envReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            Stripe {readiness.envReady ? "test-ready" : "keys missing"}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              readiness.fulfillmentReady
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            POD {readiness.fulfillmentReady ? "configured" : "simulated"}
          </span>
        </div>
        {readiness.blockers.length > 0 && (
          <ul className="mt-3 text-sm text-rose-700 space-y-1">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        )}
        <ul className="mt-3 text-sm text-stone-600 space-y-1">
          {readiness.nextActions.map((action) => (
            <li key={action}>→ {action}</li>
          ))}
        </ul>
      </section>

      {sessionPreview?.session && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-semibold text-emerald-900 flex items-center gap-2">
            <Package className="w-4 h-4" />
            {sessionPreview.simulated ? "Simulated Checkout Session" : "Checkout Session"}
          </h3>
          {sessionPreview.error && (
            <p className="text-sm text-rose-700 mt-2">{sessionPreview.error}</p>
          )}
          {sessionPreview.hint && (
            <p className="text-sm text-emerald-800 mt-2">{sessionPreview.hint}</p>
          )}
          {sessionPreview.checkoutUrl && (
            <a
              href={sessionPreview.checkoutUrl}
              className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-indigo-700 hover:text-indigo-900"
            >
              Open Stripe Checkout <ArrowRight className="w-4 h-4" />
            </a>
          )}
          <pre className="mt-3 text-xs bg-white/80 rounded-lg p-4 overflow-x-auto text-stone-800">
            {JSON.stringify(sessionPreview.session, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
