"use client";

import ProductPipelineDiagram from "@/components/ProductPipelineDiagram";
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
  const color = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-500" : "text-rose-500";
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
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Generated {new Date(snapshot.generatedAt).toLocaleString()}</p>
      </header>

      <ProductPipelineDiagram />

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Market launch command center</h2>
            <p className="text-sm text-gray-700 dark:text-gray-400 mt-1">
              Supply velocity + demand sync + checkout — single gate before scaling ads or outreach
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {snapshot.launchCommandCenter.overallLaunchScore}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{snapshot.launchCommandCenter.overallStatus}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span
            className={`px-2 py-1 rounded-full ${snapshot.launchCommandCenter.readyToOnboardArtists ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
          >
            {snapshot.launchCommandCenter.readyToOnboardArtists ? "✓" : "○"} Onboard artists
          </span>
          <span
            className={`px-2 py-1 rounded-full ${snapshot.launchCommandCenter.readyToAcceptPayments ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
          >
            {snapshot.launchCommandCenter.readyToAcceptPayments ? "✓" : "○"} Accept payments
          </span>
          <span
            className={`px-2 py-1 rounded-full ${snapshot.launchCommandCenter.readyToScaleAds ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
          >
            {snapshot.launchCommandCenter.readyToScaleAds ? "✓" : "○"} Scale ads
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {snapshot.launchCommandCenter.gates.map((gate) => (
            <div
              key={gate.id}
              className="border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-800 dark:text-gray-400">{gate.label}</p>
                <StatusBadge status={gate.status === "ready" ? "healthy" : gate.status === "watch" ? "watch" : "blocked"} />
              </div>
              <p className="text-xl font-bold tabular-nums mt-1">{gate.score}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{gate.summary}</p>
            </div>
          ))}
        </div>
        {snapshot.launchCommandCenter.topBlockers.length > 0 && (
          <ul className="mt-4 text-sm text-amber-800 dark:text-amber-200 space-y-1">
            {snapshot.launchCommandCenter.topBlockers.map((blocker) => (
              <li key={blocker}>→ {blocker}</li>
            ))}
          </ul>
        )}
      </section>

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
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenue (modeled)</h2>
          <p className="text-2xl font-bold mt-2 tabular-nums">
            ${snapshot.monthlyGrossRevenue.toLocaleString()}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> / mo gross</span>
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
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Catalog health</h2>
          <p className="text-2xl font-bold mt-2">
            {snapshot.catalog.liveArtworks}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> live SKUs</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>Avg launch readiness: {snapshot.catalog.averageReadinessScore}/100</li>
            <li>Proof queue: {snapshot.catalog.proofQueue}</li>
            <li>Release-ready: {snapshot.release.releaseReadyCount}</li>
            <li>Consent-cleared: {snapshot.consent.clearedCount}</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Supply pipeline</h2>
          <p className="text-2xl font-bold mt-2">
            {snapshot.outreachCohortAttribution.funnelCounts["live-listing"]}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> live from outreach</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>
              {snapshot.outreachCohortAttribution.conversionRates.replyRate}% reply ·{" "}
              {snapshot.outreachCohortAttribution.conversionRates.onboardRate}% onboard ·{" "}
              {snapshot.outreachCohortAttribution.conversionRates.liveRate}% live
            </li>
            <li>
              ${snapshot.outreachCohortAttribution.attributedPayoutLive.toLocaleString()}/mo attributed live
            </li>
            <li>{snapshot.outreach.readyForOnboarding} onboarding-ready replies</li>
            <li className="text-indigo-600 dark:text-indigo-400">{snapshot.outreachCohortAttribution.summaryLabel}</li>
          </ul>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Buyer checkout funnel</h2>
            <p className="text-sm text-gray-700 dark:text-gray-400 mt-1">
              Cart → Stripe session → paid — readiness before scaling ad traffic
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {snapshot.checkoutFunnel.overallReadiness}%
            </p>
            <p className="text-xs text-gray-800 dark:text-gray-400">checkout readiness</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {snapshot.checkoutFunnel.stages.map((stage) => (
            <div
              key={stage.stage}
              className="border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-800 dark:text-gray-400">{stage.stage}</p>
                <StatusBadge status={stage.status} />
              </div>
              <p className="text-xl font-bold tabular-nums mt-1">{stage.count}</p>
              {stage.conversionFromPrevious !== null && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{stage.conversionFromPrevious}% from prior</p>
              )}
            </div>
          ))}
        </div>
        <ul className="mt-4 text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {snapshot.checkoutFunnel.nextActions.slice(0, 3).map((action) => (
            <li key={action}>→ {action}</li>
          ))}
        </ul>
        <Link
          href="/checkout"
          className="inline-block mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Open checkout lab →
        </Link>
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
                <p className="text-xs text-gray-800 dark:text-gray-400">{stage.stage}</p>
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {snapshot.fulfillment.label} — score {snapshot.fulfillment.score}/100
          </p>
          <div className="space-y-3">
            {fulfillmentPartners.map((partner) => (
              <div key={partner.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{partner.name}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{partner.regions.join(" · ")}</p>
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {snapshot.advertising.label} — {snapshot.advertising.creativesReady} creatives ready ·{" "}
            {snapshot.advertising.mockupCoveragePercent}% mockup coverage
          </p>
          <div className="space-y-3">
            {snapshot.advertising.platforms.map((platform) => (
              <div key={platform.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{platform.name}</span>
                  <span className="tabular-nums text-gray-500 dark:text-gray-400">{platform.readinessPercent}%</span>
                </div>
                <div className="mt-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      platform.launchReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${platform.readinessPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{platform.nextAction}</p>
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
                <p className="text-xs text-gray-800 dark:text-gray-400">
                  {allocation.eligible
                    ? `LTV:CAC ${allocation.ltvToCacRatio.toFixed(1)}x`
                    : allocation.blockers.join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold tabular-nums">${allocation.recommendedWeeklyBudget}</p>
                <p className="text-xs text-gray-800 dark:text-gray-400">
                  {!allocation.eligible ? "blocked" : `$${allocation.profitAfterCAC.toFixed(0)} contrib`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
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

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">Order records (webhook scaffold)</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          In-memory orders from payment_intent.succeeded — persists to Convex in Phase 3
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Total orders</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.orderSummary.totalOrders}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Paid</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.orderSummary.paidOrders}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Fulfillment queued</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.orderSummary.fulfillmentQueued}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Revenue (cents)</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.orderSummary.totalRevenueCents}</p>
          </div>
        </div>
        <Link
          href="/checkout"
          className="inline-block mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Open checkout lab →
        </Link>
      </section>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">Stripe payout ledger (webhook scaffold)</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          In-memory ledger from verified webhooks — persists to Convex in Phase 3
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Entries</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.payoutLedger.totalEntries}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Transfers</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.payoutLedger.transferCount}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Payments</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.payoutLedger.paymentCount}</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 dark:text-gray-400">Artist accounts</p>
            <p className="text-xl font-bold tabular-nums">{snapshot.payoutLedger.artistAccounts.length}</p>
          </div>
        </div>
        <Link
          href="/payout-simulator"
          className="inline-block mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Open payout simulator →
        </Link>
      </section>

      <section className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/artist-onboard"
          className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          Artist onboarding
        </Link>
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
