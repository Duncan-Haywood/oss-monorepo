"use client";

import { useMemo, useState } from "react";

export default function FinancialProjections() {
  const [printPrice, setPrintPrice] = useState(85);
  const [podCost, setPodCost] = useState(28);
  const [artistCount, setArtistCount] = useState(100);
  const [printsPerArtist, setPrintsPerArtist] = useState(3);
  const [monthlyAdSpend, setMonthlyAdSpend] = useState(5000);
  const [cac, setCac] = useState(12);

  const unitEconomics = useMemo(() => {
    const processing = printPrice * 0.03;
    const netProfit = printPrice - processing - podCost;
    const artistShare = netProfit * 0.3;
    const platformShare = netProfit * 0.7;
    const margin = (netProfit / printPrice) * 100;
    return { processing, netProfit, artistShare, platformShare, margin };
  }, [printPrice, podCost]);

  const monthlyProjection = useMemo(() => {
    const totalPrints = artistCount * printsPerArtist;
    const grossRevenue = totalPrints * printPrice;
    const platformRevenue = totalPrints * unitEconomics.platformShare;
    const artistPayouts = totalPrints * unitEconomics.artistShare;
    const newBuyers = monthlyAdSpend / cac;
    const adDrivenPrints = newBuyers * 1.2;
    const adDrivenPlatformRevenue = adDrivenPrints * unitEconomics.platformShare;
    const totalPlatformRevenue = platformRevenue + adDrivenPlatformRevenue;
    const netAfterAds = totalPlatformRevenue - monthlyAdSpend;
    return {
      totalPrints: Math.round(totalPrints + adDrivenPrints),
      grossRevenue: Math.round(grossRevenue),
      platformRevenue: Math.round(totalPlatformRevenue),
      artistPayouts: Math.round(artistPayouts + adDrivenPrints * unitEconomics.artistShare),
      netAfterAds: Math.round(netAfterAds),
      annualRunRate: Math.round(netAfterAds * 12),
    };
  }, [artistCount, printsPerArtist, printPrice, unitEconomics, monthlyAdSpend, cac]);

  const scenarios = useMemo(() => {
    const base = { artists: 100, prints: 3, adSpend: 5000 };
    return [
      { label: "Conservative", artists: 50, prints: 2, adSpend: 2000, color: "text-amber-600" },
      { label: "Base Case", ...base, color: "text-blue-600" },
      { label: "Aggressive", artists: 250, prints: 5, adSpend: 15000, color: "text-green-600" },
    ].map((s) => {
      const prints = s.artists * s.prints;
      const platformRev = prints * unitEconomics.platformShare;
      const adPrints = (s.adSpend / cac) * 1.2;
      const total = platformRev + adPrints * unitEconomics.platformShare - s.adSpend;
      return { ...s, monthlyNet: Math.round(total), annual: Math.round(total * 12) };
    });
  }, [unitEconomics, cac]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold border-b pb-4 text-gray-900 dark:text-white">
          Financial Projections & Profitability Model
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-4">
          Interactive model based on our 70/30 net profit split. Adjust assumptions to explore scenarios.
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-5">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Unit Economics Inputs</h2>
          {[
            { label: "Print Price ($)", value: printPrice, set: setPrintPrice, min: 40, max: 200, step: 5 },
            { label: "POD Cost ($)", value: podCost, set: setPodCost, min: 15, max: 50, step: 1 },
            { label: "Active Artists", value: artistCount, set: setArtistCount, min: 10, max: 500, step: 10 },
            { label: "Prints/Artist/Month", value: printsPerArtist, set: setPrintsPerArtist, min: 0.5, max: 10, step: 0.5 },
            { label: "Monthly Ad Spend ($)", value: monthlyAdSpend, set: setMonthlyAdSpend, min: 0, max: 50000, step: 500 },
            { label: "CAC ($)", value: cac, set: setCac, min: 5, max: 40, step: 1 },
          ].map((input) => (
            <div key={input.label}>
              <div className="flex justify-between text-sm mb-1">
                <label className="font-medium text-gray-700 dark:text-gray-300">{input.label}</label>
                <span className="font-mono text-gray-900 dark:text-white">
                  {typeof input.value === "number" && input.step < 1 ? input.value.toFixed(1) : input.value}
                </span>
              </div>
              <input
                type="range"
                min={input.min}
                max={input.max}
                step={input.step}
                value={input.value}
                onChange={(e) => input.set(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Per-Print Breakdown</h2>
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 font-mono text-sm space-y-2">
            <div className="flex justify-between border-b pb-2 dark:border-gray-600">
              <span>Sale Price</span><span>${printPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Payment Processing (3%)</span><span>-${unitEconomics.processing.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>POD + Shipping</span><span>-${podCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t dark:border-gray-600">
              <span>Net Profit</span>
              <span>${unitEconomics.netProfit.toFixed(2)} ({unitEconomics.margin.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400">
              <span>Artist (30%)</span><span>${unitEconomics.artistShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600 dark:text-green-400 font-bold">
              <span>Platform (70%)</span><span>${unitEconomics.platformShare.toFixed(2)}</span>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white pt-4">Monthly Projection</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Prints", value: monthlyProjection.totalPrints.toLocaleString() },
              { label: "Gross Revenue", value: `$${monthlyProjection.grossRevenue.toLocaleString()}` },
              { label: "Platform Revenue", value: `$${monthlyProjection.platformRevenue.toLocaleString()}` },
              { label: "Artist Payouts", value: `$${monthlyProjection.artistPayouts.toLocaleString()}` },
              { label: "Net After Ads", value: `$${monthlyProjection.netAfterAds.toLocaleString()}`, highlight: true },
              { label: "Annual Run Rate", value: `$${monthlyProjection.annualRunRate.toLocaleString()}`, highlight: true },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`p-4 rounded-xl border ${
                  stat.highlight
                    ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                }`}
              >
                <p className="text-xs text-gray-800 dark:text-gray-400">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.highlight ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-white"}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Scenario Comparison</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Artists</th>
                <th className="py-2 pr-4">Prints/Artist</th>
                <th className="py-2 pr-4">Ad Spend</th>
                <th className="py-2 pr-4">Monthly Net</th>
                <th className="py-2">Annual</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.label} className="border-b border-gray-200 dark:border-gray-700">
                  <td className={`py-2 pr-4 font-bold ${s.color}`}>{s.label}</td>
                  <td className="py-2 pr-4">{s.artists}</td>
                  <td className="py-2 pr-4">{s.prints}</td>
                  <td className="py-2 pr-4">${s.adSpend.toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono">${s.monthlyNet.toLocaleString()}</td>
                  <td className="py-2 font-mono font-bold">${s.annual.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-sm text-gray-600 dark:text-gray-400 border-t pt-4">
        <p>
          Assumptions: 70/30 platform/artist split on net profit; 3% payment processing; ad-driven prints assume 1.2 prints per acquired buyer;
          organic prints from artist catalog sales only. Does not include fixed costs (hosting, AI compute, salaries) — typically $8–15k/mo at base case scale.
        </p>
      </section>
    </div>
  );
}
