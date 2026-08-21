"use client";

import DemoNav from "@/components/shared/DemoNav";
import { BarChart3, Image as ImageIcon, Settings, Wallet, Bell, Upload, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ArtistEarningsCalculator from "@/components/ArtistEarningsCalculator";
import {
  calculateCatalogSummary,
  calculateLaunchReadiness,
  calculatePrintEconomics,
  catalogArtworks,
} from "@/lib/marketplace";

const payouts = [
  { date: "Oct 1, 2026", amount: 842.10, status: "Scheduled", prints: 52 },
  { date: "Sep 1, 2026", amount: 756.40, status: "Paid", prints: 47 },
  { date: "Aug 1, 2026", amount: 623.80, status: "Paid", prints: 38 },
];

export default function ArtistPortal() {
  const [activeTab, setActiveTab] = useState("overview");
  const summary = calculateCatalogSummary(catalogArtworks);
  const totalSales = catalogArtworks.reduce((sum, artwork) => sum + artwork.salesLast30Days, 0);
  const proofQueue = catalogArtworks.filter((artwork) => artwork.status === "Proof pending");
  const readinessQueue = catalogArtworks
    .map((artwork) => ({ artwork, readiness: calculateLaunchReadiness(artwork) }))
    .sort((a, b) => a.readiness.score - b.readiness.score);
  const nextCatalogFix = readinessQueue.find((item) => item.readiness.blockers.length > 0);
  const recentSales = catalogArtworks
    .filter((artwork) => artwork.status === "Live" && artwork.salesLast30Days > 0)
    .slice(0, 3);

  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden dark:bg-gray-900">
      <DemoNav current="/artist-portal" />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-stone-200 dark:border-gray-700 flex-col hidden md:flex">
          <div className="p-6">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <span className="text-blue-700 dark:text-blue-200 font-bold text-lg">AJ</span>
            </div>
            <h2 className="font-bold text-stone-900 dark:text-white">Alex Jenkins</h2>
            <p className="text-sm text-stone-500 dark:text-gray-400">Fine Art Painter</p>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            {[
              { id: "overview", icon: BarChart3, label: "Overview" },
              { id: "portfolio", icon: ImageIcon, label: "Portfolio" },
              { id: "payouts", icon: Wallet, label: "Payouts" },
              { id: "settings", icon: Settings, label: "Settings" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  activeTab === item.id
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 font-medium"
                    : "text-stone-600 hover:bg-stone-50 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <header className="bg-white dark:bg-gray-800 border-b border-stone-200 dark:border-gray-700 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white capitalize">{activeTab}</h1>
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white dark:border-gray-600 transition"
              >
                Return to Docs
              </Link>
              <button aria-label="Notifications" className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-gray-300 rounded-full hover:bg-stone-50 dark:hover:bg-gray-700">
                <Bell className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="p-8 max-w-6xl mx-auto">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Projected Monthly Payout</p>
                    <h3 className="text-3xl font-bold text-stone-900 dark:text-white">${summary.projectedMonthlyArtistPayout.toLocaleString()}</h3>
                    <p className="text-sm text-green-700 dark:text-green-500 mt-2">From shared catalog economics</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Prints Sold</p>
                    <h3 className="text-3xl font-bold text-stone-900 dark:text-white">{totalSales}</h3>
                    <p className="text-sm text-green-700 dark:text-green-500 mt-2">Last 30 days</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Catalog Readiness</p>
                    <h3 className="text-3xl font-bold text-stone-900 dark:text-white">{summary.averageReadinessScore}%</h3>
                    <Link href="/capture" className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline inline-block">
                      {summary.liveArtworks} live / {summary.totalArtworks} total pieces →
                    </Link>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-stone-900 dark:text-white">Proof Approval Required</p>
                    <p className="text-sm text-stone-600 dark:text-gray-300">
                      {proofQueue.length > 0
                        ? `"${proofQueue[0].title}" has been digitized and needs your review.`
                        : "No proofs are waiting on the artist."}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("portfolio")}
                    className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50"
                  >
                    Review Proof
                  </button>
                </div>

                {nextCatalogFix && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">AI catalog launch queue</p>
                        <h3 className="mt-1 font-bold text-stone-900 dark:text-white">
                          Next fix: {nextCatalogFix.artwork.title} ({nextCatalogFix.readiness.score}% ready)
                        </h3>
                        <p className="mt-1 text-sm text-stone-600 dark:text-gray-300">
                          Blockers: {nextCatalogFix.readiness.blockers.join(", ")}.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab("portfolio")}
                        className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900"
                      >
                        Open catalog queue
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-200 dark:border-gray-700">
                    <h3 className="font-bold text-stone-900 dark:text-white">Recent Sales</h3>
                  </div>
                  <div className="divide-y divide-stone-100 dark:divide-gray-700">
                    {recentSales.map((sale, i) => {
                      const economics = calculatePrintEconomics({
                        retailPrice: sale.retailPrice,
                        fulfillmentCost: sale.fulfillmentCost,
                      });

                      return (
                      <div key={sale.slug} className="px-6 py-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-gray-750">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-stone-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-stone-400" />
                          </div>
                          <div>
                            <p className="font-medium text-stone-900 dark:text-white">{sale.title}</p>
                            <p className="text-sm text-stone-500 dark:text-gray-400">16x20 Archival Print • {sale.salesLast30Days} sold this month</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-green-700 dark:text-green-400">+${economics.artistShare.toFixed(2)}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">Net 30% of ${sale.retailPrice}</p>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "portfolio" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-stone-500">{catalogArtworks.length} pieces in catalog</p>
                  <Link href="/capture" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700">
                    <Upload className="w-4 h-4" /> Upload New Piece
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {catalogArtworks.map((piece) => {
                    const readiness = calculateLaunchReadiness(piece);

                    return (
                    <div key={piece.slug} className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 overflow-hidden flex">
                      <div className={`w-24 ${piece.imageClass}`} />
                      <div className="p-4 flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-stone-900 dark:text-white">{piece.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            piece.status === "Live" ? "bg-green-100 text-green-700" :
                            piece.status === "Proof pending" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {piece.status}
                          </span>
                        </div>
                        <p className="text-sm text-stone-500 mt-2">
                          {piece.salesLast30Days} sold • ${piece.projectedMonthlyArtistPayout.toLocaleString()} projected payout
                        </p>
                        <p className="text-xs text-stone-400 mt-1">Launch readiness: {readiness.score}% • {readiness.label}</p>
                        {readiness.blockers.length > 0 && (
                          <button className="text-xs text-blue-600 mt-2 hover:underline">{readiness.blockers[0]} →</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "payouts" && (
              <div className="space-y-6">
                <ArtistEarningsCalculator />
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6">
                  <p className="text-sm text-stone-500">Next Payout (Net-15 via Stripe Connect)</p>
                  <p className="text-3xl font-bold text-stone-900 dark:text-white mt-1">$842.10</p>
                  <p className="text-sm text-stone-500 mt-1">Scheduled for Oct 1, 2026 • 52 prints</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-stone-200 dark:border-gray-700">
                    <h3 className="font-bold text-stone-900 dark:text-white">Payout History</h3>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-stone-50 dark:bg-gray-750">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Prints</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-gray-700">
                      {payouts.map((p) => (
                        <tr key={p.date}>
                          <td className="px-6 py-4 text-stone-900 dark:text-white">{p.date}</td>
                          <td className="px-6 py-4 text-stone-500">{p.prints}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              p.status === "Paid" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-medium">${p.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-6 max-w-lg">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6 space-y-4">
                  <h3 className="font-bold text-stone-900 dark:text-white">Profile</h3>
                  <div>
                    <label className="text-xs text-stone-500">Display Name</label>
                    <input defaultValue="Alex Jenkins" className="w-full mt-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500">Bio (used for SEO artist pages)</label>
                    <textarea defaultValue="Fine art painter specializing in coastal landscapes and abstract compositions." className="w-full mt-1 px-3 py-2 border rounded-lg h-20 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6">
                  <h3 className="font-bold text-stone-900 dark:text-white mb-2">Stripe Connect</h3>
                  <p className="text-sm text-stone-500 mb-3">Payouts enabled • Bank account ending in 4521</p>
                  <button className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
                    Manage in Stripe <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6">
                  <h3 className="font-bold text-stone-900 dark:text-white mb-2">Notifications</h3>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" defaultChecked className="rounded" />
                    Email me when a print sells
                  </label>
                  <label className="flex items-center gap-3 text-sm mt-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    Email me when proof is ready for review
                  </label>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
