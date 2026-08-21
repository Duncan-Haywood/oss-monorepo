"use client";

import { useMemo, useState } from "react";
import {
  buildCatalogMetadataDashboard,
  getMetadataDimensionLabel,
  type MetadataDimension,
} from "@/lib/catalog-intelligence";

const confidenceColors = {
  high: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
  medium: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
  low: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30",
};

export default function CatalogMetadataDashboard() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const dashboard = useMemo(() => buildCatalogMetadataDashboard(), []);
  const selected =
    dashboard.artworks.find((item) => item.artworkSlug === selectedSlug) ?? dashboard.artworks[0] ?? null;

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
          AI/ML · Catalog intelligence
        </p>
        <h1 className="text-3xl font-bold mt-1">Metadata Confidence Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Score AI tags, SEO copy, room mockups, and proof approval before publishing to programmatic SEO,
          ads, or storefront routes.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">Avg confidence</p>
          <p className="text-3xl font-bold">{dashboard.averageConfidence}%</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">AI-ready listings</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{dashboard.aiReadyCount}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">Needs attention</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
            {dashboard.needsAttentionCount}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">Top gap</p>
          <p className="text-sm font-semibold mt-2">{dashboard.topGaps[0] ?? "—"}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2 max-h-[28rem] overflow-y-auto">
          {dashboard.artworks.map((item) => (
            <button
              key={item.artworkSlug}
              type="button"
              onClick={() => setSelectedSlug(item.artworkSlug)}
              className={`w-full text-left border rounded-lg p-3 transition ${
                selected?.artworkSlug === item.artworkSlug
                  ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{item.artworkTitle}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.aiReady ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {item.overallConfidence}%
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{item.artistName}</p>
              {item.blockers.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 truncate">
                  {item.blockers.slice(0, 2).join(" · ")}
                </p>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-5 space-y-4">
            <div>
              <h2 className="text-xl font-bold">{selected.artworkTitle}</h2>
              <p className="text-sm text-gray-700 dark:text-gray-400">{selected.artistName}</p>
              <p className="text-sm mt-2">
                Overall confidence:{" "}
                <span className="font-bold">{selected.overallConfidence}%</span>
                {selected.aiReady && (
                  <span className="ml-2 text-xs text-emerald-600 font-medium">AI-ready</span>
                )}
              </p>
            </div>

            <div className="space-y-3">
              {selected.dimensions.map((dimension) => (
                <div
                  key={dimension.dimension}
                  className="border border-gray-100 dark:border-gray-700 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {getMetadataDimensionLabel(dimension.dimension as MetadataDimension)}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColors[dimension.confidence]}`}
                    >
                      {dimension.score}% · {dimension.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{dimension.recommendation}</p>
                  {dimension.gaps.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      Gaps: {dimension.gaps.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
