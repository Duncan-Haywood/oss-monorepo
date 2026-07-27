import Link from "next/link";
import type { CategoryLandingPage } from "@/lib/marketing/category-landing";
import type { CheckoutAcquisitionSource } from "@/lib/checkout/acquisition-source";
import { getBundle } from "@/lib/pricing/bundles";
import { getCategoryTheme } from "@/lib/previews/themes";
import { categoryLandingServiceJsonLd, safeJsonLdScript } from "@/lib/seo";

/**
 * Shared renderer for every /websites-for-* page — each page.tsx supplies
 * its own CATEGORY_LANDING_PAGES entry and generateMetadata; the markup
 * itself (hero, pain points, features, FAQ, CTA) is identical in structure
 * across categories, only the copy and theme differ. Keeps the 3 landing
 * pages from drifting into 3 independently-maintained layouts.
 */

// Maps this landing page's category to its checkout acquisition-source token
// (see acquisition-source-checkout-attribution) — undefined for a category
// with no landing page (defensive; CATEGORY_LANDING_PAGES today only ever
// supplies restaurant/salon/trades/retail entries), in which case the CTA
// omits ?source= entirely rather than sending an unrecognized token.
function acquisitionSourceForCategory(
  category: CategoryLandingPage["category"],
): CheckoutAcquisitionSource | undefined {
  switch (category) {
    case "restaurant":
      return "cat-restaurant";
    case "salon":
      return "cat-salon";
    case "trades":
      return "cat-trades";
    case "retail":
      return "cat-retail";
    case "health":
      return "cat-health";
    case "automotive":
      return "cat-automotive";
    default:
      return undefined;
  }
}

export function CategoryLandingContent({ page }: { page: CategoryLandingPage }) {
  const theme = getCategoryTheme(page.category);
  const bundle = getBundle(page.recommendedTier);
  const jsonLd = categoryLandingServiceJsonLd(page);
  const acquisitionSource = acquisitionSourceForCategory(page.category);
  const checkoutHref = `/checkout?tier=${page.recommendedTier}${
    acquisitionSource ? `&source=${acquisitionSource}` : ""
  }`;

  return (
    <main className={theme.shellClass}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdScript(jsonLd) }}
      />

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <p className={`text-sm font-medium uppercase tracking-[0.2em] ${theme.accentTextClass}`}>
          {theme.heroEyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          {page.heroHeadline}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-700">{page.heroSubhead}</p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href={checkoutHref}
            className={`inline-flex h-12 items-center justify-center rounded-full px-8 font-medium transition-colors ${theme.ctaClass}`}
          >
            Get started{bundle ? ` — ${bundle.name} from $${bundle.setupPriceUsd}` : ""}
          </Link>
          <Link
            href={`/preview/${page.exampleLeadSlug}`}
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            See a live example
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className={`rounded-2xl border p-8 backdrop-blur ${theme.panelClass}`}>
          <h2 className="text-lg font-semibold text-zinc-900">Sound familiar?</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-700">
            {page.painPoints.map((point) => (
              <li key={point} className="flex gap-2">
                <span aria-hidden className={theme.accentTextClass}>
                  ·
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
          What you get
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {page.features.map((feature) => (
            <li
              key={feature}
              className={`rounded-2xl border p-5 text-sm text-zinc-700 backdrop-blur ${theme.panelClass}`}
            >
              <span className={`mr-2 ${theme.accentTextClass}`}>✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Questions {page.navLabel.toLowerCase()} owners ask
        </h2>
        <dl className="mt-8 space-y-6">
          {page.faq.map((entry) => (
            <div key={entry.question}>
              <dt className="font-semibold text-zinc-900">{entry.question}</dt>
              <dd className="mt-2 text-sm leading-6 text-zinc-600">{entry.answer}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href={checkoutHref}
            className={`inline-flex h-12 items-center justify-center rounded-full px-8 font-medium transition-colors ${theme.ctaClass}`}
          >
            Get started{bundle ? ` — ${bundle.name} from $${bundle.setupPriceUsd}` : ""}
          </Link>
          <Link href="/#pricing" className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline">
            Compare all bundles
          </Link>
        </div>
      </section>
    </main>
  );
}
