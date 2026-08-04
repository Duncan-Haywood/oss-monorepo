"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Users,
  Image as ImageIcon,
  Box,
  AlertCircle,
  Database,
  Server,
  Zap,
  ShieldCheck,
  CheckCircle2,
  CircleDollarSign,
  LockKeyhole,
} from "lucide-react";
import FulfillmentSubmissionsPanel from "@/components/FulfillmentSubmissionsPanel";
import {
  buildListingConsentGate,
  buildListingReleaseDecisions,
  buildPayoutExceptionQueue,
  calculateCatalogSummary,
  catalogArtworks,
} from "@/lib/marketplace";
import {
  buildPayoutReconciliationWithDiagnostics,
  calculatePayoutExceptionResolutionVelocity,
  formatCents,
} from "@/lib/payout-reconciliation";
import { executeConnectPayoutBatchTransfer, type ConnectBatchTransferResult } from "@/lib/stripe-connect";
import { inspectPayoutReserveHealth } from "@/lib/payout-reserve-health";
import { analyzeArtistRetentionAndPayoutCohorts } from "@/lib/artist-cohort-analytics";


type ReleaseStatusFilter = "all" | "hold" | "override-review" | "release-ready";
type ConsentScenario = "current" | "urban-cleared";

const releaseFilters: { id: ReleaseStatusFilter; label: string }[] = [
  { id: "all", label: "All listings" },
  { id: "hold", label: "Ops holds" },
  { id: "override-review", label: "Finance review" },
  { id: "release-ready", label: "Release ready" },
];

const releaseStatusStyles = {
  hold: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  "override-review": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "release-ready": "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const consentStatusStyles = {
  cleared: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  "missing-consent": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "release-blocked": "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

export default function AdminPortal() {
  const [minimumArtistPayout, setMinimumArtistPayout] = useState(8);
  const [targetPodAdvantage, setTargetPodAdvantage] = useState(0);
  const [releaseStatusFilter, setReleaseStatusFilter] = useState<ReleaseStatusFilter>("all");
  const [consentScenario, setConsentScenario] = useState<ConsentScenario>("current");
  const [batchTransferResult, setBatchTransferResult] = useState<ConnectBatchTransferResult | null>(null);
  const consentRecords = useMemo(
    () => [
      {
        artworkSlug: "midnight-coast",
        podLicenseAccepted: true,
        paidAdRightsAccepted: true,
        aiRoomSceneAccepted: true,
        payoutAcknowledged: true,
      },
      {
        artworkSlug: "urban-geometry",
        podLicenseAccepted: true,
        paidAdRightsAccepted: consentScenario === "urban-cleared",
        aiRoomSceneAccepted: consentScenario === "urban-cleared",
        payoutAcknowledged: true,
      },
    ],
    [consentScenario],
  );
  const payoutQueue = useMemo(
    () =>
      buildPayoutExceptionQueue(catalogArtworks, {
        monthlyOrders: 12,
        minimumArtistPayoutPerOrder: minimumArtistPayout,
        targetPodAdvantagePerOrder: targetPodAdvantage,
      }),
    [minimumArtistPayout, targetPodAdvantage],
  );
  const releaseQueue = useMemo(
    () =>
      buildListingReleaseDecisions(catalogArtworks, {
        monthlyOrders: 12,
        minimumArtistPayoutPerOrder: minimumArtistPayout,
        targetPodAdvantagePerOrder: targetPodAdvantage,
      }),
    [minimumArtistPayout, targetPodAdvantage],
  );
  const consentGate = useMemo(
    () =>
      buildListingConsentGate(catalogArtworks, consentRecords, {
        monthlyOrders: 12,
        minimumArtistPayoutPerOrder: minimumArtistPayout,
        targetPodAdvantagePerOrder: targetPodAdvantage,
      }),
    [consentRecords, minimumArtistPayout, targetPodAdvantage],
  );
  const filteredReleaseDecisions = releaseQueue.decisions.filter(
    (decision) => releaseStatusFilter === "all" || decision.releaseStatus === releaseStatusFilter,
  );
  const catalogSummary = calculateCatalogSummary(catalogArtworks);
  const criticalPayoutItems = payoutQueue.filter((item) => item.severity === "critical").length;

  const payoutReconciliation = useMemo(() => {
    const diagnostics = buildPayoutReconciliationWithDiagnostics({
      resolveArtistAccount: (order) => ({
        artistAccountId:
          order.artistAccountId ??
          `acct_${order.artistHandle?.replace("@", "") ?? "default"}`,
        artistHandle: order.artistHandle ?? "@artist",
      }),
    });
    const velocity = calculatePayoutExceptionResolutionVelocity(diagnostics.report);
    return { ...diagnostics, velocity };
  }, []);

  const payoutReserveHealth = useMemo(() => {
    return inspectPayoutReserveHealth({
      availablePlatformBalanceCents: 450000,
      pendingArtistTransfersCents: 120000,
      unresolvedPayoutVariancesCents: payoutReconciliation.velocity.underpaidCentsOwed,
      monthlyFulfillmentLiabilityCents: 110000,
      monthlyGrossRevenueCents: 680000,
      transfersCount: 4,
    });
  }, [payoutReconciliation]);

  const artistCohorts = useMemo(() => {
    return analyzeArtistRetentionAndPayoutCohorts();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 font-sans">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 text-white">
          <Zap className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight">Print Atelier <span className="text-slate-500 font-normal">| Operations Command</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs font-medium bg-green-500/10 text-green-400 px-3 py-1 rounded-full border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            All Systems Operational
          </span>
          <Link href="/" className="ml-4 text-sm font-medium px-4 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-white transition">Exit to Docs</Link>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Active Artists", value: "2,405", trend: "+12", icon: <Users className="w-5 h-5 text-blue-400" /> },
            { label: "Consent Blocks", value: `${consentGate.blockedCount}`, trend: `${consentGate.clearedCount} cleared`, icon: <ImageIcon className="w-5 h-5 text-purple-400" /> },
            { label: "Pending Fulfillment", value: "412", trend: "-5%", icon: <Box className="w-5 h-5 text-amber-400" /> },
            { label: "Payout Exceptions", value: `${payoutQueue.length}`, trend: `${criticalPayoutItems} critical`, icon: <ShieldCheck className="w-5 h-5 text-emerald-400" /> }
          ].map((kpi, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 backdrop-blur flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">{kpi.label}</p>
                <p className="text-3xl font-bold text-white mb-2">{kpi.value}</p>
                <span className="text-xs text-slate-500">{kpi.trend} today</span>
              </div>
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">{kpi.icon}</div>
            </div>
          ))}
        </div>

        <FulfillmentSubmissionsPanel />

        {/* Artist Payout Reconciliation & Exception Resolution Velocity */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 text-emerald-400" /> Artist Payout Reconciliation & Velocity
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {payoutReconciliation.velocity.velocityLabel}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5">
                <p className="text-xl font-bold text-emerald-200">{payoutReconciliation.velocity.resolutionRatePercent}%</p>
                <p className="text-slate-400">Reconciled</p>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5">
                <p className="text-xl font-bold text-rose-200">{payoutReconciliation.velocity.underpaidAccounts}</p>
                <p className="text-slate-400">Underpaid</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5">
                <p className="text-xl font-bold text-amber-200">{formatCents(payoutReconciliation.velocity.underpaidCentsOwed)}</p>
                <p className="text-slate-400">Owed to Artists</p>
              </div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5">
                <p className="text-xl font-bold text-blue-200">{payoutReconciliation.velocity.estimatedResolutionHours}h</p>
                <p className="text-slate-400">Est. Workload</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {payoutReconciliation.attributionGap.blocker && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{payoutReconciliation.attributionGap.blocker}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-700/40 text-xs">
              <div className="text-slate-300">
                <span className="font-semibold text-white">Batch Transfer Helper:</span> Automatically top-up accounts missing payouts using Stripe Connect.
              </div>
              <button
                type="button"
                onClick={() => {
                  const res = executeConnectPayoutBatchTransfer({
                    report: payoutReconciliation.report,
                    minTransferCents: 100,
                    maxTransferCents: 100000,
                    testMode: true,
                  });
                  setBatchTransferResult(res);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition text-xs flex items-start gap-1.5"
              >
                Prepare Batch Top-Up Transfers
              </button>
            </div>

            {batchTransferResult && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-emerald-300">
                  <span>{batchTransferResult.summaryLabel}</span>
                  <span>Total Top-Up: {formatCents(batchTransferResult.totalTopUpCents)}</span>
                </div>
                {batchTransferResult.instructions.length > 0 && (
                  <div className="space-y-1 text-slate-300">
                    <p className="font-medium text-slate-200">Pending Top-Up Instructions:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {batchTransferResult.instructions.map((inst, idx) => (
                        <li key={idx}>
                          Connect Account <span className="font-mono text-emerald-400">{inst.artistAccountId}</span>: {formatCents(inst.amountCents)} ({inst.description})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {batchTransferResult.skippedAccounts.length > 0 && (
                  <p className="text-slate-400 italic">
                    Skipped {batchTransferResult.skippedAccounts.length} account(s) due to threshold or balance bounds.
                  </p>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-3">Artist Account</th>
                    <th className="px-4 py-3">Handle</th>
                    <th className="px-4 py-3 text-center">Orders</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Settled</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Action / Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                  {payoutReconciliation.report.rows.map((row) => {
                    const statusClass =
                      row.status === "underpaid"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : row.status === "overpaid"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : row.status === "unpaid"
                        ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                        : row.status === "balanced"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-500/30 bg-slate-500/10 text-slate-300";

                    return (
                      <tr key={row.artistAccountId} className={row.status === "underpaid" ? "bg-rose-950/20" : "hover:bg-slate-700/30"}>
                        <td className="px-4 py-3 font-semibold text-white">{row.artistAccountId}</td>
                        <td className="px-4 py-3 text-slate-400">{row.artistHandle ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-slate-300">{row.orderCount}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-200">{formatCents(row.expectedPayoutCents)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{formatCents(row.settledPayoutCents)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.varianceCents < 0 ? "text-rose-400" : row.varianceCents > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                          {formatCents(row.varianceCents)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${statusClass}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans text-slate-300">
                          {row.actionLabel}
                        </td>
                      </tr>
                    );
                  })}
                  {payoutReconciliation.report.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500 font-sans">
                        No reconciled payout records found. Orders must be stamped with artistAccountId.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Payout Reserve Buffer Health & Artist Cohorts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reserve Buffer Health Panel */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Stripe Connect Reserve Buffer Health
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Platform balance & reserve coverage ratio against pending payouts & POD liabilities
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  payoutReserveHealth.status === "healthy"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : payoutReserveHealth.status === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                {payoutReserveHealth.status.toUpperCase()} ({payoutReserveHealth.reserveCoveragePercent}%)
              </span>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Available Cash</p>
                  <p className="text-lg font-bold text-white mt-1">
                    {formatCents(payoutReserveHealth.availablePlatformBalanceCents)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Target Reserve</p>
                  <p className="text-lg font-bold text-amber-300 mt-1">
                    {formatCents(payoutReserveHealth.recommendedReserveBufferCents)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Safety Margin</p>
                  <p
                    className={`text-lg font-bold mt-1 ${
                      payoutReserveHealth.netSafetyMarginCents >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCents(payoutReserveHealth.netSafetyMarginCents)}
                  </p>
                </div>
              </div>

              <div className="space-y-1 bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                <p className="font-semibold text-slate-200">Liabilities Breakdown:</p>
                <div className="flex justify-between text-slate-300">
                  <span>Pending Artist Transfers:</span>
                  <span className="font-mono">{formatCents(payoutReserveHealth.breakdown.pendingArtistTransfersCents)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Unresolved Payout Variances:</span>
                  <span className="font-mono">{formatCents(payoutReserveHealth.breakdown.unresolvedPayoutVariancesCents)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Fulfillment POD Invoices:</span>
                  <span className="font-mono">{formatCents(payoutReserveHealth.breakdown.monthlyFulfillmentLiabilityCents)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Est. Connect Payout Fees:</span>
                  <span className="font-mono">{formatCents(payoutReserveHealth.breakdown.estimatedConnectPayoutFeesCents)}</span>
                </div>
              </div>

              {payoutReserveHealth.warnings.length > 0 && (
                <div className="space-y-1">
                  {payoutReserveHealth.warnings.map((w, idx) => (
                    <p key={idx} className="text-rose-300 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Artist Retention & Payout Repeat Cohort Panel */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" /> Artist Retention & Payout Cohorts
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {artistCohorts.summaryLabel}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                {artistCohorts.repeatPayoutArtistPercent}% Repeat Rate
              </span>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Total Artists</p>
                  <p className="text-lg font-bold text-white mt-1">{artistCohorts.totalUniqueArtists}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Repeat Payout Artists</p>
                  <p className="text-lg font-bold text-blue-300 mt-1">{artistCohorts.repeatPayoutArtistCount}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
                  <p className="text-slate-400">Avg Orders/Artist</p>
                  <p className="text-lg font-bold text-emerald-300 mt-1">{artistCohorts.averageOrdersPerArtist}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-200">Monthly Payout Cohorts:</p>
                {artistCohorts.cohortSummaries.map((cohort) => (
                  <div key={cohort.cohortMonth} className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/40 space-y-1">
                    <div className="flex justify-between font-semibold text-slate-300">
                      <span>Cohort {cohort.cohortMonth}: {cohort.initialArtistCount} artist(s)</span>
                      <span>{formatCents(cohort.initialPayoutCents)} initial</span>
                    </div>
                    <div className="flex gap-4 text-slate-400 text-[11px]">
                      {Object.values(cohort.periods).map((p) => (
                        <span key={p.monthOffset}>
                          M{p.monthOffset}: {p.retainedArtists} active ({p.retentionRatePercent}%)
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>


        {/* Payout Guardrails */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex flex-col gap-3 bg-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Payout Promise Guardrail
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Blocks artist outreach when POD cost, proof status, or missing mockups make the 30% net-profit promise unsafe.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 md:min-w-[380px]">
              <label className="space-y-2">
                <span className="flex justify-between text-slate-400">
                  Artist payout floor <strong className="text-white">${minimumArtistPayout}/print</strong>
                </span>
                <input
                  type="range"
                  min="4"
                  max="16"
                  value={minimumArtistPayout}
                  onChange={(event) => setMinimumArtistPayout(Number(event.target.value))}
                  className="w-full accent-emerald-400"
                />
              </label>
              <label className="space-y-2">
                <span className="flex justify-between text-slate-400">
                  POD advantage target <strong className="text-white">${targetPodAdvantage}/print</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={targetPodAdvantage}
                  onChange={(event) => setTargetPodAdvantage(Number(event.target.value))}
                  className="w-full accent-blue-400"
                />
              </label>
              <div className="flex gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setMinimumArtistPayout(11);
                    setTargetPodAdvantage(4);
                  }}
                  className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Stress test guardrails
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMinimumArtistPayout(8);
                    setTargetPodAdvantage(0);
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-2 font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Catalog risk summary</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{catalogSummary.totalArtworks}</p>
                  <p className="text-xs text-slate-500">SKUs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-300">{catalogSummary.liveArtworks}</p>
                  <p className="text-xs text-slate-500">Live SKUs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-300">{payoutQueue.length}</p>
                  <p className="text-xs text-slate-500">Guardrail holds</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Safe listings can use transparent payout proof in sales copy. Held listings must fix price, POD cost,
                proof approval, or room scenes before an artist sees the promise.
              </p>
            </div>
            <div className="space-y-3">
              {payoutQueue.map((item) => (
                <div key={item.artwork.slug} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            item.severity === "critical"
                              ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          }`}
                        >
                          {item.severity}
                        </span>
                        <h3 className="text-lg font-semibold text-white">{item.artwork.title}</h3>
                        <span className="text-sm text-slate-500">by {item.artwork.artistName}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{item.holdMessage}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Suggested retail</p>
                      <p className="text-2xl font-bold text-white">${item.suggestedRetailPrice}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    {item.blockers.map((blocker) => (
                      <span key={blocker} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">
                        {blocker}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-medium text-blue-200">{item.nextAction}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Listing Release Workflow */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          <div className="border-b border-slate-700/50 bg-slate-800 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Listing Hold / Release Workflow
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Turns payout guardrails into an operator decision: release to outreach, send to finance, or keep hidden
                  from artist-facing trust copy.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[420px]">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-2xl font-bold text-emerald-200">{releaseQueue.releaseReadyCount}</p>
                  <p className="text-emerald-100/70">Release ready</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-2xl font-bold text-amber-200">{releaseQueue.overrideReviewCount}</p>
                  <p className="text-amber-100/70">Finance review</p>
                </div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
                  <p className="text-2xl font-bold text-rose-200">{releaseQueue.holdCount}</p>
                  <p className="text-rose-100/70">Ops holds</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {releaseFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setReleaseStatusFilter(filter.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    releaseStatusFilter === filter.id
                      ? "border-blue-400 bg-blue-500/20 text-blue-100"
                      : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {filteredReleaseDecisions.map((decision) => (
              <article key={decision.artwork.slug} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${releaseStatusStyles[decision.releaseStatus]}`}>
                        {decision.releaseStatus.replace("-", " ")}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">
                        Owner: {decision.owner}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{decision.artwork.title}</h3>
                    <p className="text-sm text-slate-500">by {decision.artwork.artistName}</p>
                  </div>
                  <div className="mt-1 grid w-full grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs md:mt-0 md:w-56">
                    <div className="text-left">
                      <p className="uppercase tracking-wide text-slate-400">Payout</p>
                      <p className="text-lg font-bold text-white">${decision.currentArtistPayoutPerOrder.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="uppercase tracking-wide text-slate-400">POD edge</p>
                      <p className={decision.podAdvantagePerOrder >= 0 ? "text-lg font-bold text-emerald-200" : "text-lg font-bold text-rose-200"}>
                        ${decision.podAdvantagePerOrder.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-[1fr_auto]">
                  <p className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-slate-300">
                    {decision.artistFacingCopy}
                  </p>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Suggested retail</p>
                    <p className="text-2xl font-bold text-white">${decision.suggestedRetailPrice}</p>
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm font-medium text-blue-200">
                  {decision.releaseStatus === "release-ready" ? (
                    <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  ) : (
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  )}
                  {decision.operatorAction}
                </p>
                {(decision.blockers.length > 0 || decision.overrideReasons.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...decision.blockers, ...decision.overrideReasons].map((reason) => (
                      <span key={reason} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {filteredReleaseDecisions.length === 0 && (
              <p className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400 lg:col-span-2">
                No listings match this release filter under the current payout guardrails.
              </p>
            )}
          </div>
        </section>

        {/* Consent Gate */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          <div className="border-b border-slate-700/50 bg-slate-800 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-white">
                  <LockKeyhole className="h-4 w-4 text-amber-300" /> Listing Consent Gate
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Blocks storefront, outreach, paid ads, and AI room-preview use until the artist has accepted the exact
                  rights needed for that channel.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[420px]">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-2xl font-bold text-emerald-200">{consentGate.clearedCount}</p>
                  <p className="text-emerald-100/70">Fully cleared</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-2xl font-bold text-amber-200">{consentGate.missingConsentCount}</p>
                  <p className="text-amber-100/70">Need consent</p>
                </div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
                  <p className="text-2xl font-bold text-rose-200">
                    {consentGate.items.filter((item) => item.consentStatus === "release-blocked").length}
                  </p>
                  <p className="text-rose-100/70">Release blocked</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConsentScenario("current")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  consentScenario === "current"
                    ? "border-amber-400 bg-amber-500/20 text-amber-100"
                    : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:text-white"
                }`}
              >
                Current consent ledger
              </button>
              <button
                type="button"
                onClick={() => setConsentScenario("urban-cleared")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  consentScenario === "urban-cleared"
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                    : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:text-white"
                }`}
              >
                Collect Urban Geometry ad + AI rights
              </button>
            </div>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {consentGate.items.map((item) => (
              <article key={item.artwork.slug} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${consentStatusStyles[item.consentStatus]}`}>
                        {item.consentStatus.replace("-", " ")}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">
                        Owner: {item.owner}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{item.artwork.title}</h3>
                    <p className="text-sm text-slate-500">by {item.artwork.artistName}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs md:w-56">
                    <p className="uppercase tracking-wide text-slate-500">Allowed channels</p>
                    <p className="mt-1 font-semibold text-white">
                      {item.allowedChannels.length > 0 ? item.allowedChannels.join(", ") : "None yet"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm font-medium text-blue-200">{item.operatorAction}</p>
                {item.missingConsents.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.missingConsents.map((consent) => (
                      <span key={consent} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        Missing: {consent}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Console */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Real-time AI Pipeline */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800">
                <h2 className="font-semibold text-white flex items-center gap-2"><Database className="w-4 h-4" /> AI Enhancement Pipeline</h2>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">Live Feed</span>
              </div>
              <div className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                    <tr>
                      <th className="px-5 py-3">Task ID</th>
                      <th className="px-5 py-3">Artist</th>
                      <th className="px-5 py-3">Stage</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {[
                      { id: "img_9x8f2a", artist: "s.chen", stage: "ESRGAN Upscaling", status: "Processing", time: "4s", color: "text-blue-400" },
                      { id: "img_2b4c19", artist: "ajenkins", stage: "Color Calibration", status: "Processing", time: "12s", color: "text-blue-400" },
                      { id: "img_7f3e22", artist: "m.doe", stage: "Mockup Gen (x4)", status: "Completed", time: "34s", color: "text-emerald-400" },
                      { id: "img_1a9d45", artist: "r.smith", stage: "Metadata Tagging", status: "Completed", time: "41s", color: "text-emerald-400" },
                      { id: "img_5c8b33", artist: "l.wu", stage: "Initial Upload", status: "Resolution too low", time: "1m", color: "text-rose-400" },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-slate-700/30 transition">
                        <td className="px-5 py-3 font-mono text-xs text-slate-300">{row.id}</td>
                        <td className="px-5 py-3 text-slate-300">{row.artist}</td>
                        <td className="px-5 py-3">{row.stage}</td>
                        <td className={`px-5 py-3 ${row.color} flex items-center gap-1.5`}>
                          {row.status === "Processing" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
                          {row.status}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-right">{row.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>

          {/* Sidebar Modules */}
          <div className="space-y-6">
            
            {/* System Health */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800">
                <h2 className="font-semibold text-white flex items-center gap-2"><Server className="w-4 h-4" /> Infrastructure Status</h2>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label: "Frontend Nodes", usage: 34 },
                  { label: "GPU Inference Clusters", usage: 82 },
                  { label: "Printful API Gateway", usage: 12 },
                  { label: "Postgres Main", usage: 45 }
                ].map((sys, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">{sys.label}</span>
                      <span className="text-slate-400 font-mono">{sys.usage}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${sys.usage > 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${sys.usage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Recent Alerts</h2>
              <div className="space-y-3">
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-rose-200 font-medium">Gelato API Rate Limit</p>
                    <p className="text-xs text-rose-300/70 mt-0.5">EU fulfillment endpoints returning 429. Auto-routing to backup providers.</p>
                  </div>
                </div>
                <div className="bg-slate-700/30 border border-slate-600/50 p-3 rounded-lg flex items-start gap-3">
                  <Database className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-300 font-medium">DB Snapshot Complete</p>
                    <p className="text-xs text-slate-500 mt-0.5">Routine snapshot saved to S3 bucket /backups/daily.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
