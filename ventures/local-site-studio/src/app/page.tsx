import Link from "next/link";
import { brand } from "@/lib/brand";
import {
  BUNDLES,
  COMMERCE_ADDON,
  formatPriceUsd,
  type BundleTier,
} from "@/lib/pricing/bundles";

const steps = [
  {
    title: "We find your business",
    description:
      "We identify local businesses from public directories and build a site tailored to your industry.",
  },
  {
    title: "Preview before you buy",
    description:
      "Receive a link to your pre-built website. Talk to our AI assistant for tweaks, or buy as-is — no sales calls.",
  },
  {
    title: "Go live in days",
    description:
      "Pay via secure checkout, connect your domain, and launch — with optional marketing and AI phone support.",
  },
];

/**
 * Marketing copy per tier. Prices are deliberately absent: they are read from
 * BUNDLES below, so the amount this page advertises is the same field the
 * Stripe Checkout Session is built from. Typing "$99/mo" here would let the
 * advertised price and the charged price drift apart silently — which is the
 * defect src/lib/pricing/advertised-price-claims.test.ts exists to catch.
 */
const bundleCopy: Record<
  BundleTier,
  { tagline: string; features: string[]; highlighted: boolean }
> = {
  starter: {
    tagline: "Your site, live in days",
    features: [
      "Professional landing page",
      "Contact form and Google Maps embed",
      "Basic SEO and fast hosting",
      "Preview subdomain → custom domain handoff",
    ],
    highlighted: false,
  },
  growth: {
    tagline: "Site + customers on autopilot",
    features: [
      "Everything in Starter",
      "8 social/GBP posts + 2 emails per month",
      "Ready-to-post packs for Google, Facebook, Instagram",
      "Brand voice from your site data",
    ],
    highlighted: true,
  },
  complete: {
    tagline: "Never miss a call or a customer",
    features: [
      "Everything in Growth",
      "Full marketing — seasonal promos, A/B variants",
      "AI phone agent for your business line",
      "Appointment booking and lead capture",
    ],
    highlighted: false,
  },
};

const bundles = BUNDLES.map((bundle) => ({
  id: bundle.id,
  name: bundle.name,
  setup: formatPriceUsd(bundle.setupPriceUsd),
  recurring:
    bundle.monthlyPriceUsd == null
      ? null
      : `${formatPriceUsd(bundle.monthlyPriceUsd)}/mo`,
  ...bundleCopy[bundle.id],
}));

const entryPrice = formatPriceUsd(
  Math.min(...BUNDLES.map((bundle) => bundle.setupPriceUsd)),
);

const commerceFeatures = [
  "Stripe checkout and simple catalog (≤50 SKUs)",
  "Retail, restaurant ordering, booking deposits, or gift cards",
  "Order notification emails to you",
  "Stacks on Starter, Growth, or Complete",
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
            Pre-built websites for local businesses
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
            Your website, built before you buy
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600">
            {brand.name} creates professional websites for restaurants, salons, trades,
            and other local businesses. Preview your site first — choose Starter from{" "}
            {entryPrice}, or add automated marketing and an AI phone agent. Self-serve
            checkout, no sales calls.
          </p>
          {!brand.isConfigured && (
            <p className="mt-4 text-sm text-amber-700">
              Operator note: set <code className="text-xs">NEXT_PUBLIC_BRAND_NAME</code>{" "}
              in .env.local to replace the &ldquo;{brand.name}&rdquo; placeholder.
            </p>
          )}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="#pricing"
              className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white transition-colors hover:bg-zinc-700"
            >
              View pricing
            </Link>
            <Link
              href="/preview/example-bakery"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              See bakery preview
            </Link>
            <Link
              href="/preview/serene-salon"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              Salon
            </Link>
            <Link
              href="/preview/mountain-plumbing"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              Trades
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-zinc-400">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Choose your bundle</h2>
          <p className="mt-4 text-zinc-600">
            Every bundle includes a professional website. Add marketing automation or an AI
            phone agent when your business needs them. Payments processed securely via Stripe.
          </p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className={`flex flex-col rounded-2xl border p-8 shadow-sm ${
                bundle.highlighted
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  bundle.highlighted ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {bundle.name}
              </p>
              <p
                className={`mt-1 text-sm ${
                  bundle.highlighted ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {bundle.tagline}
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-tight">{bundle.setup}</p>
              {bundle.recurring ? (
                <p
                  className={`mt-1 text-sm ${
                    bundle.highlighted ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  + {bundle.recurring} after go-live
                </p>
              ) : (
                <p
                  className={`mt-1 text-sm ${
                    bundle.highlighted ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  One-time payment
                </p>
              )}
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {bundle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className={bundle.highlighted ? "text-zinc-500" : "text-zinc-400"}>
                      ✓
                    </span>
                    <span className={bundle.highlighted ? "text-zinc-200" : "text-zinc-700"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/checkout?tier=${bundle.id}`}
                className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-full font-medium transition-colors ${
                  bundle.highlighted
                    ? "bg-white text-zinc-900 hover:bg-zinc-100"
                    : "bg-zinc-900 text-white hover:bg-zinc-700"
                }`}
              >
                Get {bundle.name}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-zinc-500">
          Sold by {brand.legalEntity}. Call our AI assistant to compare tiers — no human sales
          calls.
        </p>
      </section>

      <section id="commerce" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
                Optional add-on
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Commerce — sell online, not just inform
              </h2>
              <p className="mt-4 text-zinc-600">
                Add online ordering, retail checkout, booking deposits, or gift cards to any
                bundle. Best for restaurants with pickup, retail shops, and salons that take
                deposits.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                {commerceFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="mt-1 text-zinc-400">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">{COMMERCE_ADDON.name}</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                +{formatPriceUsd(COMMERCE_ADDON.setupPriceUsd)}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                One-time setup + {formatPriceUsd(COMMERCE_ADDON.monthlyPriceUsd)}/mo · stacks
                on any bundle
              </p>
              <Link
                href="/checkout?commerce=1"
                className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-300 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
              >
                Add at checkout
              </Link>
              <p className="mt-4 text-center text-xs text-zinc-500">
                Quote-based trades? Starter or Complete fits better than Commerce.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Before you buy</h2>
        <dl className="mt-10 max-w-3xl space-y-8">
          <div>
            <dt className="font-semibold text-zinc-900">Do I see the site before paying?</dt>
            <dd className="mt-2 text-sm leading-6 text-zinc-600">
              Yes. Open a category preview (bakery, salon, or trades above), then claim it from
              checkout. Your slug stays on the payment link so we know which site to hand off.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-900">What happens after Stripe?</dt>
            <dd className="mt-2 text-sm leading-6 text-zinc-600">
              You get a receipt, a deploy handoff with DNS steps, and a working contact form on
              the preview. An operator marks you live once DNS is confirmed — usually days, not
              weeks.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-900">Is there a sales call?</dt>
            <dd className="mt-2 text-sm leading-6 text-zinc-600">
              No. Self-serve checkout, optional AI assistant for questions. Sold by{" "}
              {brand.legalEntity}.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
