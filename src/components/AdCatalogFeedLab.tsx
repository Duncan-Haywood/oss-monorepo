"use client";

import {
  buildAdCatalogFeed,
  serializeAdCatalogFeedJson,
  serializeMetaCatalogFeedCsv,
  type AdCatalogPlatform,
} from "@/lib/ad-catalog";
import { useMemo, useState } from "react";

const platforms: { id: AdCatalogPlatform | "all"; label: string }[] = [
  { id: "all", label: "All platforms" },
  { id: "meta", label: "Meta" },
  { id: "google", label: "Google" },
  { id: "pinterest", label: "Pinterest" },
];

export default function AdCatalogFeedLab() {
  const [platformFilter, setPlatformFilter] = useState<AdCatalogPlatform | "all">("all");
  const [baselineCAC, setBaselineCAC] = useState(68);
  const [showBlocked, setShowBlocked] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

  const feed = useMemo(
    () => buildAdCatalogFeed({ baselineCAC, baseUrl: "https://printatelier.com" }),
    [baselineCAC],
  );

  const filteredItems = useMemo(() => {
    const byPlatform =
      platformFilter === "all"
        ? feed.items
        : feed.items.filter((item) => item.platform === platformFilter);
    return showBlocked ? byPlatform : byPlatform.filter((item) => item.eligible);
  }, [feed.items, platformFilter, showBlocked]);

  const exportPayload = useMemo(() => {
    if (exportFormat === "json") {
      return serializeAdCatalogFeedJson(feed, !showBlocked);
    }
    const platform = platformFilter === "all" ? "meta" : platformFilter;
    return serializeMetaCatalogFeedCsv(feed, platform, !showBlocked);
  }, [exportFormat, feed, platformFilter, showBlocked]);

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
          Programmatic demand
        </p>
        <h1 className="text-3xl font-bold mt-1">Ad Catalog Feed Lab</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Generate Meta, Google, and Pinterest product catalog rows from consent-cleared SEO print pages
          — only listings that pass creative readiness and paid-ad rights sync to ad platforms.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Feed health</p>
          <p className="text-3xl font-bold">{feed.feedHealthScore}</p>
          <p className="text-xs text-gray-500 mt-1">0–100 sync readiness</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Eligible rows</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{feed.eligibleCount}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Blocked rows</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{feed.blockedCount}</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Platforms sync-ready</p>
          <p className="text-3xl font-bold text-violet-700 dark:text-violet-300">
            {Object.values(feed.platformSummary).filter((summary) => summary.syncReady).length}/3
          </p>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {(["meta", "google", "pinterest"] as AdCatalogPlatform[]).map((platform) => {
          const summary = feed.platformSummary[platform];
          return (
            <div
              key={platform}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold capitalize">{platform}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    summary.syncReady
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {summary.syncReady ? "Sync ready" : "Hold sync"}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {summary.eligible} eligible · need {summary.minCreativesRequired} creatives
              </p>
              <p className="text-xs mt-2 text-gray-500">
                {summary.minCreativesMet ? "Minimum met" : "Below creative minimum"}
              </p>
            </div>
          );
        })}
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Platform</span>
            <select
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value as AdCatalogPlatform | "all")}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
            >
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Baseline CAC (${baselineCAC})</span>
            <input
              type="range"
              min={40}
              max={120}
              value={baselineCAC}
              onChange={(event) => setBaselineCAC(Number(event.target.value))}
              className="w-48"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showBlocked}
              onChange={(event) => setShowBlocked(event.target.checked)}
            />
            Show blocked rows
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Export</span>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as "json" | "csv")}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
            >
              <option value="json">JSON feed</option>
              <option value="csv">Meta CSV</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-4">Platform</th>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Creative</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Blockers</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice(0, 12).map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4 capitalize">{item.platform}</td>
                  <td className="py-2 pr-4 max-w-xs truncate">{item.title}</td>
                  <td className="py-2 pr-4">{item.creativeReadinessScore}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        item.eligible
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {item.eligible ? "Eligible" : "Blocked"}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {item.blockers.length > 0 ? item.blockers.join(" · ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Export preview ({exportFormat.toUpperCase()})</p>
          <pre className="text-xs bg-gray-950 text-gray-100 rounded-lg p-4 overflow-x-auto max-h-64">
            {exportPayload.slice(0, 2000)}
            {exportPayload.length > 2000 ? "\n…" : ""}
          </pre>
        </div>
      </section>
    </div>
  );
}
