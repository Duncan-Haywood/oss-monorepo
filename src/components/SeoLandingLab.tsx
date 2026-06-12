"use client";

import {
  formatSeoVolume,
  generateSeoLandingPages,
  getSeoIntentLabel,
  type SeoLandingIntent,
} from "@/lib/seo";
import { useMemo, useState } from "react";

const intentFilters: Array<SeoLandingIntent | "all"> = [
  "all",
  "room-style",
  "long-tail-tag",
  "artist-story",
  "payout-proof",
];

export default function SeoLandingLab() {
  const [intentFilter, setIntentFilter] = useState<SeoLandingIntent | "all">("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const result = useMemo(() => generateSeoLandingPages(), []);
  const filtered =
    intentFilter === "all"
      ? result.pages
      : result.pages.filter((page) => page.intent === intentFilter);
  const selected = filtered.find((page) => page.slug === selectedSlug) ?? filtered[0] ?? null;

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
          Digital-first GTM
        </p>
        <h1 className="text-3xl font-bold mt-1">Programmatic SEO Lab</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Auto-generate long-tail landing pages from catalog tags, room intent, artist stories, and payout
          proof — ready to export for static generation once listings clear consent and proof gates.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Pages generated</p>
          <p className="text-3xl font-bold">{result.pages.length}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Eligible to publish</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{result.totalEligible}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Blocked by readiness</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{result.blockedCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Top intent</p>
          <p className="text-sm font-semibold mt-2">
            {(() => {
              const top = Object.entries(result.topIntents).sort((a, b) => b[1] - a[1])[0];
              return top ? getSeoIntentLabel(top[0] as SeoLandingIntent) : "—";
            })()}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {intentFilters.map((intent) => (
          <button
            key={intent}
            type="button"
            onClick={() => setIntentFilter(intent)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              intentFilter === intent
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            }`}
          >
            {intent === "all" ? "All intents" : getSeoIntentLabel(intent)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
          {filtered.map((page) => (
            <button
              key={page.slug}
              type="button"
              onClick={() => setSelectedSlug(page.slug)}
              className={`w-full text-left border rounded-lg p-3 transition ${
                selected?.slug === page.slug
                  ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm truncate">{page.title}</p>
                <span className="text-xs text-gray-500 shrink-0">{formatSeoVolume(page.estimatedMonthlySearchVolume)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">/{page.slug}</p>
              {page.blockers.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Blocked: {page.blockers.join(", ")}
                </p>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
            <div className="bg-gradient-to-br from-slate-800 to-indigo-900 text-white p-6">
              <p className="text-xs uppercase tracking-wider opacity-70">{getSeoIntentLabel(selected.intent)}</p>
              <h2 className="text-2xl font-bold mt-2">{selected.heroHeadline}</h2>
              <p className="text-sm opacity-90 mt-3">{selected.payoutProofLine}</p>
              <div className="flex gap-2 mt-4">
                <span className="text-xs bg-white/20 px-2 py-1 rounded">{selected.primaryCta}</span>
                <span className="text-xs bg-white/10 px-2 py-1 rounded">{selected.secondaryCta}</span>
              </div>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase">SEO title</p>
                <p className="font-medium">{selected.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Meta description</p>
                <p className="text-gray-600 dark:text-gray-300">{selected.metaDescription}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">URL slug</p>
                <p className="font-mono text-indigo-600 dark:text-indigo-400">/prints/{selected.slug}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Tags</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <p className="text-gray-500">Artwork</p>
                  <p className="font-medium">{selected.artworkTitle}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <p className="text-gray-500">Artist</p>
                  <p className="font-medium">{selected.artistName}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
