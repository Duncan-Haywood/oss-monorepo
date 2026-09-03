import Link from "next/link";
import { Testimonials } from "@/components/marketing/testimonials";
import { brand } from "@/lib/brand";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { COMMERCE_ADDON, getBundle } from "@/lib/pricing/bundles";
import {
  EAA_EVIDENCE_PATH,
  eaaJobPriceRangeLabel,
  eaaRetestPriceRangeLabel,
} from "@/lib/pricing/eaa-evidence";

const steps = [
  {
    title: "We find your business",
    description:
      "We identify local businesses from public directories and build a site tailored to your industry.",
  },
  {
    title: "Preview before you buy",
    description:
      "Receive a link to your pre-built website. Email us for tweaks, or buy as-is — no sales calls.",
  },
  {
    title: "Go live in days",
    description:
      "Pay via secure checkout, connect your domain, and launch — with optional marketing and AI phone support.",
  },
];

// Only page-specific display state (which card gets the "recommended" treatment)
// lives here — name, USD prices, tagline, and feature bullets all render
// straight from BUNDLES (src/lib/pricing/bundles.ts), the single source of
// truth Stripe checkout AND the /preview/[slug] tier upsell also read, so a
// future price or feature change (BUSINESS_DECISIONS) can't leave this, the
// highest-traffic page, advertising stale copy while checkout/preview show
// something else (homepage-bundle-pricing-single-source-of-truth,
// bundle-features-single-source-of-truth).
const bundleMarketingCopy = [
  { id: "starter" as const, highlighted: false },
  { id: "growth" as const, highlighted: true },
  { id: "complete" as const, highlighted: false },
];

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
            ${getBundle("starter")!.setupPriceUsd}, or add automated marketing and an AI
            phone agent. Self-serve checkout, no sales calls.
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
                <p className="text-sm font-medium text-zinc-500">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Built for your industry</h2>
        <p className="mt-4 max-w-2xl text-zinc-600">
          Every bundle adapts to how your business actually runs — see what that looks like for
          yours.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {CATEGORY_LANDING_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-colors hover:border-zinc-400"
            >
              <p className="text-sm font-medium text-zinc-500">{page.navLabel}</p>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900">{page.heroHeadline}</h3>
              <p className="mt-3 text-sm text-zinc-500 underline-offset-4">See what&rsquo;s included →</p>
            </Link>
          ))}
        </div>
      </section>

      <Testimonials />

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Choose your bundle</h2>
          <p className="mt-4 text-zinc-600">
            Every bundle includes a professional website. Add marketing automation or an AI
            phone agent when your business needs them. Payments processed securely via Stripe.
          </p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {bundleMarketingCopy.map((copy) => {
            const bundle = getBundle(copy.id)!;
            return (
              <div
                key={bundle.id}
                className={`flex flex-col rounded-2xl border p-8 shadow-sm ${
                  copy.highlighted
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    copy.highlighted ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  {bundle.name}
                </p>
                <p
                  className={`mt-1 text-sm ${
                    copy.highlighted ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  {bundle.tagline}
                </p>
                <p className="mt-4 text-4xl font-semibold tracking-tight">
                  ${bundle.setupPriceUsd}
                </p>
                {bundle.monthlyPriceUsd != null ? (
                  <p
                    className={`mt-1 text-sm ${
                      copy.highlighted ? "text-zinc-300" : "text-zinc-600"
                    }`}
                  >
                    + ${bundle.monthlyPriceUsd}/mo after go-live
                  </p>
                ) : (
                  <p
                    className={`mt-1 text-sm ${
                      copy.highlighted ? "text-zinc-300" : "text-zinc-600"
                    }`}
                  >
                    One-time payment
                  </p>
                )}
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {bundle.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className={copy.highlighted ? "text-zinc-400" : "text-zinc-500"}>
                        ✓
                      </span>
                      <span className={copy.highlighted ? "text-zinc-200" : "text-zinc-700"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/checkout?tier=${bundle.id}&source=home`}
                  className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-full font-medium transition-colors ${
                    copy.highlighted
                      ? "bg-white text-zinc-900 hover:bg-zinc-100"
                      : "bg-zinc-900 text-white hover:bg-zinc-700"
                  }`}
                >
                  Get {bundle.name}
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-xs text-zinc-500">
          Sold by {brand.legalEntity}. Questions on tiers? Email{" "}
          <a href={`mailto:${brand.supportEmail}`} className="underline">
            {brand.supportEmail}
          </a>{" "}
          — no human sales calls.
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
                    <span className="mt-1 text-zinc-500">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Commerce add-on</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                +${COMMERCE_ADDON.setupPriceUsd}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                One-time setup + ${COMMERCE_ADDON.monthlyPriceUsd}/mo · stacks on any bundle
              </p>
              <Link
                href="/checkout?commerce=1&source=home"
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

      <section id="eaa-evidence" className="border-t border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
                New product line
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Accessibility evidence for obligated EU shops
              </h2>
              <p className="mt-4 text-zinc-600">
                A dated record of what was tested, changed, and left open — not a
                compliance certificate. For shops with at least 10 employees or more than
                €2 million turnover. Microenterprises are out of scope on purpose.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Evidence job</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                {eaaJobPriceRangeLabel()}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                Indicative · {eaaRetestPriceRangeLabel()} to keep the record current ·
                checkout not live
              </p>
              <Link
                href={EAA_EVIDENCE_PATH}
                className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Read what is sold
              </Link>
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
              No. Self-serve checkout — email{" "}
              <a href={`mailto:${brand.supportEmail}`} className="underline">
                {brand.supportEmail}
              </a>{" "}
              with questions. Sold by {brand.legalEntity}.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
