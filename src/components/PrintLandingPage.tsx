import Link from "next/link";
import {
  evaluateSeoPagePublishability,
  getSeoIntentLabel,
  type SeoLandingPage,
  type SeoPublishState,
} from "@/lib/seo";
import {
  buildListingConsentGate,
  catalogArtworks,
  defaultListingConsentRecords,
  type ListingConsentGateItem,
} from "@/lib/marketplace";

type PrintLandingPageProps = {
  page: SeoLandingPage;
  publishState?: SeoPublishState;
};

function resolvePublishState(page: SeoLandingPage): SeoPublishState {
  const consentGate = buildListingConsentGate(catalogArtworks, defaultListingConsentRecords);
  const consentItem = consentGate.items.find((item) => item.artwork.slug === page.artworkSlug);
  return evaluateSeoPagePublishability(page, consentItem);
}

function consentStatusLabel(item: ListingConsentGateItem | undefined): string {
  if (!item) return "No consent record";
  if (item.consentStatus === "cleared") return "Consent cleared";
  if (item.consentStatus === "missing-consent") return "Missing consent";
  return "Release blocked";
}

export default function PrintLandingPage({ page, publishState }: PrintLandingPageProps) {
  const state = publishState ?? resolvePublishState(page);
  const artwork = catalogArtworks.find((item) => item.slug === page.artworkSlug);
  const consentGate = buildListingConsentGate(catalogArtworks, defaultListingConsentRecords);
  const consentItem = consentGate.items.find((item) => item.artwork.slug === page.artworkSlug);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {!state.publishable && (
        <div className="bg-amber-500 text-amber-950 text-center text-sm py-2 px-4 font-medium">
          Preview only — blocked from publish: {state.blockers.join(" · ")}
        </div>
      )}

      <header className="border-b border-stone-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="font-serif tracking-wider text-lg hover:opacity-80">
            PRINT ATELIER
          </Link>
          <div className="flex gap-3 text-sm">
            <Link href="/storefront" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Storefront
            </Link>
            <Link href="/seo-lab" className="text-gray-500 hover:underline">
              SEO Lab
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div
            className={`aspect-[4/5] rounded-2xl shadow-xl ${artwork?.imageClass ?? "bg-gradient-to-br from-slate-800 to-indigo-900"}`}
          />

          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium">
                {getSeoIntentLabel(page.intent)}
              </p>
              <h1 className="text-3xl md:text-4xl font-bold mt-2">{page.heroHeadline}</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-3">{page.metaDescription}</p>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
              <p className="text-sm font-medium">{page.artworkTitle}</p>
              <p className="text-sm text-gray-500">by {page.artistName}</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-mono">{page.payoutProofLine}</p>
              <div className="flex flex-wrap gap-2">
                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-stone-100 dark:bg-gray-800 px-2 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!state.publishable}
                className={`px-5 py-3 rounded-lg font-medium transition ${
                  state.publishable
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {page.primaryCta}
              </button>
              <Link
                href="/storefront"
                className="px-5 py-3 rounded-lg border border-stone-300 dark:border-gray-700 font-medium hover:bg-stone-100 dark:hover:bg-gray-800 transition"
              >
                {page.secondaryCta}
              </Link>
            </div>

            <div className="text-xs text-gray-500 space-y-1 border-t border-stone-200 dark:border-gray-800 pt-4">
              <p>Consent: {consentStatusLabel(consentItem)}</p>
              <p>Readiness score: {page.readinessScore}/100</p>
              <p>Est. search volume: {page.estimatedMonthlySearchVolume}/mo</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
