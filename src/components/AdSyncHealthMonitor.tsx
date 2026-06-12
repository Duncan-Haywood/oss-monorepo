"use client";

import { buildAdCatalogSyncHealth, type SyncHealthStatus } from "@/lib/ad-catalog";
import { useMemo, useState } from "react";

const statusStyles: Record<SyncHealthStatus, string> = {
  healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  degraded: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  blocked: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function AdSyncHealthMonitor() {
  const [baselineCAC, setBaselineCAC] = useState(68);
  const health = useMemo(
    () => buildAdCatalogSyncHealth({ baselineCAC, baseUrl: "https://printatelier.com" }),
    [baselineCAC],
  );

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-wider">
          Programmatic demand
        </p>
        <h1 className="text-3xl font-bold mt-1">Ad Catalog Sync Health</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Monitor pixel configuration, catalog feed eligibility, and per-platform creative quotas before
          syncing consent-cleared inventory to Meta, Google, and Pinterest.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Overall health</p>
          <p className="text-3xl font-bold">{health.overallScore}</p>
          <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[health.overallStatus]}`}>
            {health.overallStatus}
          </span>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Feed health</p>
          <p className="text-3xl font-bold text-violet-700 dark:text-violet-300">{health.feedHealthScore}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Eligible rows</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{health.eligibleFeedRows}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Platforms sync-ready</p>
          <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
            {Object.values(health.platformReadiness).filter((entry) => entry.syncReady).length}/3
          </p>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {(["meta", "google", "pinterest"] as const).map((platform) => {
          const readiness = health.platformReadiness[platform];
          return (
            <div
              key={platform}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold capitalize">{platform}</h2>
                <span className="font-mono text-lg">{readiness.score}</span>
              </div>
              <p className="text-xs mt-2 text-gray-500">
                {readiness.syncReady ? "Ready for catalog API sync" : "Blocked — fix checks below"}
              </p>
              {readiness.blockers.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                  {readiness.blockers.slice(0, 2).map((blocker) => (
                    <li key={blocker}>• {blocker}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold">Sync checks</h2>
            <p className="text-sm text-gray-500">{health.summaryLabel}</p>
          </div>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Baseline CAC ${baselineCAC}
            <input
              type="range"
              min={40}
              max={120}
              value={baselineCAC}
              onChange={(event) => setBaselineCAC(Number(event.target.value))}
              className="ml-3 w-40 align-middle"
            />
          </label>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Check</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Category</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {health.checks.map((check) => (
                <tr key={check.id}>
                  <td className="px-4 py-3 font-medium">{check.label}</td>
                  <td className="px-4 py-3 text-gray-500">{check.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[check.status]}`}>
                      {check.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-5 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/30">
        <h2 className="font-semibold text-fuchsia-900 dark:text-fuchsia-100">Recommended actions</h2>
        <ul className="mt-3 space-y-2 text-sm text-fuchsia-900/90 dark:text-fuchsia-100/90">
          {health.recommendedActions.map((action) => (
            <li key={action}>• {action}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-fuchsia-800/70 dark:text-fuchsia-200/70">
          Next: connect platform catalog APIs with webhook refresh on consent updates (see backlog).
        </p>
      </section>
    </div>
  );
}
