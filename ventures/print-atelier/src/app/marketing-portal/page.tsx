"use client";

import {
  calculateCatalogSummary,
  calculateCreativeReadiness,
  catalogArtworks,
  generateAdCreativeConcepts,
  type CreativeChannel,
} from "@/lib/marketplace";
import CheckoutRetargetingPanel from "@/components/CheckoutRetargetingPanel";
import { BarChart3, Palette, ShieldAlert, Sparkles, Target, Users } from "lucide-react";
import { useState } from "react";

const channels: { id: CreativeChannel; label: string; note: string }[] = [
  {
    id: "paid-social",
    label: "Paid social",
    note: "Distinct visual concepts for Meta, TikTok, and Pinterest prospecting.",
  },
  {
    id: "search",
    label: "Search / SEO",
    note: "Long-tail room, style, and intent keywords for landing pages.",
  },
  {
    id: "artist-referral",
    label: "Artist referral",
    note: "Artist-led proof, collector trust, and transparent payout hooks.",
  },
];

export default function MarketingPortal() {
  const [selectedArtworkSlug, setSelectedArtworkSlug] = useState(catalogArtworks[0].slug);
  const [selectedChannel, setSelectedChannel] = useState<CreativeChannel>("paid-social");
  const [baselineCAC, setBaselineCAC] = useState(68);

  const selectedArtwork =
    catalogArtworks.find((artwork) => artwork.slug === selectedArtworkSlug) ?? catalogArtworks[0];
  const summary = calculateCatalogSummary(catalogArtworks);
  const readiness = calculateCreativeReadiness(selectedArtwork, { baselineCAC });
  const concepts = generateAdCreativeConcepts(selectedArtwork, selectedChannel);
  const scalableArtworks = catalogArtworks.filter(
    (artwork) => calculateCreativeReadiness(artwork, { baselineCAC }).score >= 85,
  ).length;
  const activeChannel = channels.find((channel) => channel.id === selectedChannel) ?? channels[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Marketing Automation Hub</h1>
            <p className="text-gray-500 dark:text-gray-400">Turn shared catalog metadata into scored demand campaigns</p>
          </div>
          <div className="flex gap-2">
            <a href="/ad-catalog" className="text-sm font-medium px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition">
              Ad catalog feed
            </a>
            <a href="/ad-sync-health" className="text-sm font-medium px-4 py-2 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30 transition">
              Sync health
            </a>
            <a href="/docs" className="text-sm font-medium px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition">
              Docs hub
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4">
              <BarChart3 className="text-violet-500" />
              <span className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded">CATALOG</span>
            </div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">{summary.totalArtworks}</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Catalog artworks available</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-500 mt-2">{scalableArtworks} ready for paid concept testing</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4"><Sparkles className="text-amber-500" /></div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">{readiness.score}</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Creative readiness score</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-500 mt-2">{readiness.predictedCacReductionPercent.toFixed(0)}% CAC reduction potential</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4"><Users className="text-blue-500" /></div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">${readiness.predictedCAC.toFixed(2)}</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Predicted CAC after creative lift</div>
            <div className={`text-xs mt-2 ${readiness.similarityRisk === "Low" ? "text-emerald-700 dark:text-emerald-500" : readiness.similarityRisk === "Moderate" ? "text-amber-500" : "text-red-500"}`}>
              {readiness.similarityRisk} similarity risk
            </div>
          </div>
        </div>

        <div className="mb-8">
          <CheckoutRetargetingPanel />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">Catalog to ad engine</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Pick a listing to score</h2>
              </div>
              <Target className="text-violet-500" />
            </div>

            <div className="space-y-3">
              {catalogArtworks.map((artwork) => {
                const artworkReadiness = calculateCreativeReadiness(artwork, { baselineCAC });
                return (
                  <button
                    key={artwork.slug}
                    onClick={() => setSelectedArtworkSlug(artwork.slug)}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      selectedArtwork.slug === artwork.slug
                        ? "border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/30"
                        : "border-gray-200 bg-gray-50 hover:border-violet-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-violet-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{artwork.title}</p>
                        <p className="text-xs text-gray-800 dark:text-gray-400">{artwork.artistName} · {artwork.tags.join(", ")}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                        artworkReadiness.score >= 85
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : artworkReadiness.score >= 60
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      }`}>
                        {artworkReadiness.score}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <label className="mt-6 block">
              <span className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                <span>Baseline paid CAC</span>
                <span>${baselineCAC}</span>
              </span>
              <input
                type="range"
                min="20"
                max="120"
                value={baselineCAC}
                onChange={(event) => setBaselineCAC(Number(event.target.value))}
                className="mt-2 w-full accent-violet-600"
              />
            </label>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Creative brief</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{selectedArtwork.title}</h2>
                <p className="text-sm text-gray-700 dark:text-gray-400">{readiness.label} · {activeChannel.note}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-right dark:bg-gray-900">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Projected CAC</p>
                <p className="font-mono text-2xl font-bold text-gray-900 dark:text-white">${readiness.predictedCAC.toFixed(2)}</p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    selectedChannel === channel.id
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                >
                  {channel.label}
                </button>
              ))}
            </div>

            {readiness.blockers.length > 0 && (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" />
                  Fix before scaling
                </div>
                <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-100">
                  {readiness.blockers.map((blocker) => (
                    <li key={blocker}>- {blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {concepts.map((concept) => (
                <article key={concept.format} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                  <Palette className="mb-3 h-5 w-5 text-violet-500" />
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{concept.format}</p>
                  <h3 className="mt-2 font-semibold text-gray-900 dark:text-white">{concept.hook}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{concept.message}</p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
              Next real implementation path: persist creative tests, connect channel spend, and compare predicted CAC against actual cohorts.
            </p>
          </section>
          </div>
      </div>
    </div>
  );
}
