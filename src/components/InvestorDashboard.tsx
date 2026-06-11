"use client";

import { buildInvestorSnapshot } from "@/lib/investor";

const defaultWeeklyBudget = 6800;
import { fulfillmentPartners, adPlatformPartners } from "@/lib/partners";
import Link from "next/link";
import { useMemo } from "react";

function StatusBadge({ status }: { status: "healthy" | "watch" | "blocked" }) {
  const styles = {
    healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    watch: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    blocked: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>{status}</span>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="flex flex-col items-center">
      <div className={`text-4xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">{label}</div>
    </div>
  );
}

export default function InvestorDashboard() {
  const snapshot = useMemo(() => buildInvestorSnapshot(), []);

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
          Owner dashboard
        </p>
        <h1 className="text-3xl font-bold mt-1">Print Atelier — Business Snapshot</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Condensed view of supply, demand, unit economics, partner integrations, and launch readiness —
          wired to the same shared catalog, outreach, finance, and ops math as every portal.
        </p>
        <p className="text-xs text-gray-400 mt-2">Generated {new Date(snapshot.generatedAt).toLocaleString()}</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-xl p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wider opacity-80">Market launch</p>
          <p className="text-4xl font-bold mt-2">{snapshot.marketLaunch.overall}</p>
          <p className="text-sm mt-1 opacity-90">{snapshot.marketLaunch.label}</p>
        </div>
        <ScoreRing score={snapshot.marketLaunch.supplyScore} label="Supply / catalog" />
        <ScoreRing score={snapshot.marketLaunch.demandScore} label="Demand / ads" />
        <ScoreRing score={snapshot.marketLaunch.opsScore} label="Ops / legal" />
        <ScoreRing score={snapshot.marketLaunch.fulfillmentScore} label="Fulfillment" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue (modeled)</h2>
          <p className="text-2xl font-bold mt-2 tabular-nums">
            ${snapshot.monthlyGrossRevenue.toLocaleString()}
            <span className="text-sm font-normal text-gray-500"> / mo gross</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>Platform share (70% net): ${snapshot.monthlyPlatformShare.toLocaleString()}/mo</li>
            <li>Artist payouts (30% net): ${snapshot.monthlyArtistPayouts.toLocaleString()}/mo projected</li>
            <li>
              Per-print: ${snapshot.unitEconomics.artistShare.toFixed(2)} artist · $
              {snapshot.unitEconomics.platformShare.toFixed(2)} platform
            </li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Catalog health</h2>
          <p className="text-2xl font-bold mt-2">
            {snapshot.catalog.liveArtworks}
            <span className="text-sm font-normal text-gray-500"> live SKUs</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>Avg launch readiness: {snapshot.catalog.averageReadinessScore}/100</li>
            <li>Proof queue: {snapshot.catalog.proofQueue}</li>
            <li>Release-ready: {snapshot.release.releaseReadyCount}</li>
            <li>Consent-cleared: {snapshot.consent.clearedCount}</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Supply pipeline</h2>
          <p className="text-2xl font-bold mt-2">
            {snapshot.outreach.readyForOnboarding}
            <span className="text-sm font-normal text-gray-500"> onboarding-ready</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>{snapshot.outreach.totalProspects} prospects in CRM</li>
            <li>{snapshot.outreach.repliedProspects} active replies</li>
            <li>Avg fit score: {snapshot.outreach.averageFitScore}/100</li>
            <li className="text-indigo-600 dark:text-indigo-400">{snapshot.outreach.automationLabel}</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Dual-sided pipeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {snapshot.pipelineStages.map((stage) => (
            <div
              key={stage.stage}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-xs text-gray-500">{stage.stage}</p>
                <p className="text-xl font-bold tabular-nums">{stage.count}</p>
              </div>
              <StatusBadge status={stage.status} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Fulfillment partners</h2>
          <p className="text-sm text-gray-500 mb-4">
            {snapshot.fulfillment.label} — score {snapshot.fulfillment.score}/100
          </p>
          <div className="space-y-3">
            {fulfillmentPartners.map((partner) => (
              <div key={partner.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{partner.name}</p>
                  <p className="text-gray-500 text-xs">{partner.regions.join(" · ")}</p>
                  <p className="text-gray-600 dark:text-gray-300 text-xs mt-1">{partner.nextAction}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    partner.apiStatus === "configured"
                      ? "bg-emerald-100 text-emerald-700"
                      : partner.apiStatus === "ready"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {partner.apiStatus}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Advertising & programmatic</h2>
          <p className="text-sm text-gray-500 mb-4">
            {snapshot.advertising.label} — {snapshot.advertising.creativesReady} creatives ready ·{" "}
            {snapshot.advertising.mockupCoveragePercent}% mockup coverage
          </p>
          <div className="space-y-3">
            {snapshot.advertising.platforms.map((platform) => (
              <div key={platform.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{platform.name}</span>
                  <span className="tabular-nums text-gray-500">{platform.readinessPercent}%</span>
                </div>
                <div className="mt-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      platform.launchReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${platform.readinessPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{platform.nextAction}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">Weekly channel budget (guarded)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {snapshot.channelBudget.allocations.map((allocation) => (
            <div
              key={allocation.id}
              className="flex items-center justify-between border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{allocation.label}</p>
                <p className="text-xs text-gray-500">
                  {allocation.eligible
                    ? `LTV:CAC ${allocation.ltvToCacRatio.toFixed(1)}x`
                    : allocation.blockers.join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold tabular-nums">${allocation.recommendedWeeklyBudget}</p>
                <p className="text-xs text-gray-500">
                  {!allocation.eligible ? "blocked" : `$${allocation.profitAfterCAC.toFixed(0)} contrib`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Total allocated: ${snapshot.channelBudget.allocatedBudget} / ${defaultWeeklyBudget} weekly cap ·{" "}
          {snapshot.channelBudget.allocations.filter((a) => !a.eligible).length} channels held by guardrails
        </p>
      </section>

      {snapshot.marketLaunch.topBlockers.length > 0 && (
        <section className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-2">Launch blockers</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            {snapshot.marketLaunch.topBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/storefront"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Buyer storefront
        </Link>
        <Link
          href="/artist-portal"
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Artist portal
        </Link>
        <Link
          href="/admin-portal"
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Ops console
        </Link>
        <Link href="/" className="px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          Full business plan →
        </Link>
      </section>
    </div>
  );
}
