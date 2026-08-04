"use client";

import { allocateWeeklyChannelBudget, calculateChannelScenario, calculatePrintEconomics } from "@/lib/marketplace";
import { useState } from "react";

type PrintSize = { name: string; price: number; cost: number };
type AcquisitionChannel = {
  id: string;
  label: string;
  customerAcquisitionCost: number;
  purchasesPerCustomer: number;
  note: string;
};

const acquisitionChannels: AcquisitionChannel[] = [
  {
    id: "artist-community",
    label: "Artist community loop",
    customerAcquisitionCost: 12,
    purchasesPerCustomer: 1.4,
    note: "Artist posts, email captures, and collection drops where software scales the audience without heavy paid spend.",
  },
  {
    id: "paid-social",
    label: "Paid social prospecting",
    customerAcquisitionCost: 68,
    purchasesPerCustomer: 1.6,
    note: "Cold buyer demand through Meta/TikTok/Pinterest where first-order CAC must be paid back by repeat purchases.",
  },
  {
    id: "designer-trade",
    label: "Designer trade referrals",
    customerAcquisitionCost: 35,
    purchasesPerCustomer: 2.4,
    note: "Higher-intent decorators and B2B referrals with larger repeat order potential across rooms and projects.",
  },
];

const budgetChannels = [
  {
    id: "artist-community",
    label: "Artist community loop",
    weeklyBudgetCap: 1200,
    baselineCAC: 12,
    purchasesPerCustomer: 1.4,
    previewLiftPercent: 0,
  },
  {
    id: "paid-social-preview",
    label: "Paid social + room preview",
    weeklyBudgetCap: 2200,
    baselineCAC: 68,
    purchasesPerCustomer: 1.6,
    previewLiftPercent: 35,
  },
  {
    id: "search-intent",
    label: "Search intent pages",
    weeklyBudgetCap: 1600,
    baselineCAC: 42,
    purchasesPerCustomer: 1.5,
    previewLiftPercent: 10,
  },
  {
    id: "designer-trade",
    label: "Designer trade referrals",
    weeklyBudgetCap: 1800,
    baselineCAC: 35,
    purchasesPerCustomer: 2.4,
    previewLiftPercent: 15,
  },
];

export default function RevenueModel() {
  const [printSize, setPrintSize] = useState("16x20");
  const [retailPrice, setRetailPrice] = useState(85);
  const [podCost, setPodCost] = useState(28);
  const [monthlyOrders, setMonthlyOrders] = useState(500);
  const [avgOrderValue, setAvgOrderValue] = useState(85);
  const [selectedChannelId, setSelectedChannelId] = useState("artist-community");
  const selectedChannel = acquisitionChannels.find((channel) => channel.id === selectedChannelId) ?? acquisitionChannels[0];
  const [channelCAC, setChannelCAC] = useState(selectedChannel.customerAcquisitionCost);
  const [purchasesPerCustomer, setPurchasesPerCustomer] = useState(selectedChannel.purchasesPerCustomer);
  const [weeklyGrowthBudget, setWeeklyGrowthBudget] = useState(5000);
  const [minLtvToCacRatio, setMinLtvToCacRatio] = useState(1.5);

  const aiComputeCost = 0.35;
  const economics = calculatePrintEconomics({ retailPrice, fulfillmentCost: podCost, aiComputeCost });
  const platformGross = economics.platformShare;
  const margin = economics.marginPercent.toFixed(1);

  const sizes: PrintSize[] = [
    { name: "8x10", price: 45, cost: 12 },
    { name: "11x14", price: 65, cost: 18 },
    { name: "16x20", price: 85, cost: 28 },
    { name: "24x36", price: 145, cost: 52 },
  ];

  const selectSize = (size: PrintSize) => {
    setPrintSize(size.name);
    setRetailPrice(size.price);
    setPodCost(size.cost);
  };

  const selectChannel = (channel: AcquisitionChannel) => {
    setSelectedChannelId(channel.id);
    setChannelCAC(channel.customerAcquisitionCost);
    setPurchasesPerCustomer(channel.purchasesPerCustomer);
  };

  const monthlyGMV = monthlyOrders * avgOrderValue;
  const channelScenario = calculateChannelScenario({
    retailPrice: avgOrderValue,
    fulfillmentCost: podCost,
    monthlyOrders,
    customerAcquisitionCost: channelCAC,
    purchasesPerCustomer,
    aiComputeCost,
  });
  const monthlyPlatformRevenue = channelScenario.monthlyPlatformGross;
  const monthlyArtistPayouts = channelScenario.monthlyArtistPayout;
  const monthlyFixedCosts = 3500;
  const monthlyMarketing = channelScenario.monthlyMarketingSpend;
  const monthlyEBITDA = channelScenario.monthlyContributionAfterCAC - monthlyFixedCosts;
  const contributionAfterCACPerOrder =
    channelScenario.platformGrossPerOrder - channelCAC / Math.max(purchasesPerCustomer, 0.01);
  const breakEvenOrders =
    contributionAfterCACPerOrder > 0
      ? Math.ceil(monthlyFixedCosts / contributionAfterCACPerOrder)
      : Number.POSITIVE_INFINITY;
  const weeklyBudgetPlan = allocateWeeklyChannelBudget({
    retailPrice: avgOrderValue,
    fulfillmentCost: podCost,
    aiComputeCost,
    totalWeeklyBudget: weeklyGrowthBudget,
    minLtvToCacRatio,
    channels: budgetChannels,
  });
  const recommendedChannel = weeklyBudgetPlan.allocations.find(
    (allocation) => allocation.id === weeklyBudgetPlan.recommendedChannelId,
  );

  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Revenue Model & Profitability Analysis</h1>

      <section>
        <h2 className="text-2xl font-semibold">Core Split</h2>
        <div className="overflow-x-auto not-prose">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Party</th>
                <th className="py-2 pr-4">Share</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Artist</td>
                <td className="py-2 pr-4">30% of Net Profit</td>
                <td className="py-2">On every print sale of their work</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Print Atelier (Platform)</td>
                <td className="py-2 pr-4">70% of Net Profit</td>
                <td className="py-2">Covers AI compute, hosting, marketing, and ops</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Interactive Unit Economics Calculator</h2>
        <p>AI-first, software-driven ops keep fixed costs per piece near zero. Primary costs are variable: compute, marketing, and POD fulfillment.</p>

        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 my-4 not-prose">
          <div className="flex flex-wrap gap-2 mb-6">
            {sizes.map((size) => (
              <button
                key={size.name}
                onClick={() => selectSize(size)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  printSize === size.name
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {size.name} (${size.price})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">Retail Price ($)</label>
              <input
                type="number"
                value={retailPrice}
                onChange={(e) => setRetailPrice(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">POD / Fulfillment ($)</label>
              <input
                type="number"
                value={podCost}
                onChange={(e) => setPodCost(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-end">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Size: <span className="font-mono font-bold">{printSize}</span>
              </div>
            </div>
          </div>

          <div className="font-mono text-sm bg-white dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between border-b pb-1 text-gray-800 dark:text-gray-200">
              <span>Sale Price</span> <span>${retailPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400">
              <span>Payment Processing (~3%)</span> <span>-${economics.paymentFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400">
              <span>POD Print + Shipping</span> <span>-${podCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400">
              <span>AI Compute (upscale + mockups)</span> <span>-${aiComputeCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t mt-1 text-gray-800 dark:text-gray-200">
              <span>Net Profit</span> <span>${economics.netProfit.toFixed(2)} ({margin}% margin)</span>
            </div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400 mt-2">
              <span>Artist Share (30%)</span> <span>${economics.artistShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600 dark:text-green-400 font-bold">
              <span>Platform Gross (70%)</span> <span>${platformGross.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs mt-3 text-gray-500">AI automates 80%+ of ops, enabling 55–65% platform margins at scale vs. 20–30% for traditional galleries.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Monthly P&L Projection (MVP Scale)</h2>
        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border not-prose">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">Monthly Orders</label>
              <input
                type="number"
                value={monthlyOrders}
                onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">Avg Order Value ($)</label>
              <input
                type="number"
                value={avgOrderValue}
                onChange={(e) => setAvgOrderValue(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="mb-6 rounded-lg border border-blue-100 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
            <div className="mb-3 flex flex-col gap-1">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                Channel CAC stress test
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Pick a demand channel, then stress CAC and repeat purchases to see whether the software-first growth loop pays back.
              </p>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {acquisitionChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    selectedChannelId === channel.id
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  }`}
                >
                  {channel.label}
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{selectedChannel.note}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span>Customer acquisition cost</span>
                  <span>${channelCAC}</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="120"
                  value={channelCAC}
                  onChange={(e) => setChannelCAC(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-600"
                />
              </label>
              <label className="block">
                <span className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span>Purchases per customer</span>
                  <span>{purchasesPerCustomer.toFixed(1)}x</span>
                </span>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={purchasesPerCustomer}
                  onChange={(e) => setPurchasesPerCustomer(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-600"
                />
              </label>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Payback</p>
                <p className="mt-1 font-mono text-lg font-bold text-gray-900 dark:text-white">
                  {channelScenario.paybackOrders === Number.POSITIVE_INFINITY ? "Never" : `${channelScenario.paybackOrders} order${channelScenario.paybackOrders === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">LTV:CAC</p>
                <p className={`mt-1 font-mono text-lg font-bold ${channelScenario.ltvToCacRatio >= 3 ? "text-green-600" : channelScenario.ltvToCacRatio >= 1 ? "text-amber-600" : "text-red-600"}`}>
                  {channelScenario.ltvToCacRatio.toFixed(2)}x
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Profit after CAC</p>
                <p className={`mt-1 font-mono text-lg font-bold ${channelScenario.profitAfterCAC >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${channelScenario.profitAfterCAC.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Break-even orders</p>
                <p className="mt-1 font-mono text-lg font-bold text-gray-900 dark:text-white">
                  {Number.isFinite(breakEvenOrders) ? breakEvenOrders.toLocaleString() : "No payback"}
                </p>
              </div>
            </div>
          </div>
          <div className="font-mono text-sm space-y-1 text-gray-800 dark:text-gray-200">
            <div className="flex justify-between"><span>GMV</span><span>${monthlyGMV.toLocaleString()}</span></div>
            <div className="flex justify-between text-green-600 dark:text-green-400"><span>Platform Revenue (70% net)</span><span>${monthlyPlatformRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400"><span>Artist Payouts (30% net)</span><span>${monthlyArtistPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="flex justify-between text-red-600 dark:text-red-400"><span>Fixed Costs (infra, tools, 1 FTE)</span><span>-${monthlyFixedCosts.toLocaleString()}</span></div>
            <div className="flex justify-between text-red-600 dark:text-red-400"><span>Marketing ({selectedChannel.label})</span><span>-${monthlyMarketing.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className={`flex justify-between font-bold pt-2 border-t mt-2 ${monthlyEBITDA >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              <span>Est. Monthly EBITDA</span>
              <span>${monthlyEBITDA.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <p className="text-xs mt-3 text-gray-500">
            Break-even at {Number.isFinite(breakEvenOrders) ? `~${breakEvenOrders.toLocaleString()} orders/mo` : "no positive payback"} after channel CAC.
            Artist payouts remain tied to net profit before marketing so acquisition experiments do not rewrite the artist contract.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Weekly Channel Budget Allocator</h2>
        <p>
          Operators should shift spend toward channels that clear contribution and LTV:CAC guardrails, then leave dollars unspent when every safe channel hits its cap.
        </p>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-6 not-prose dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
              <span className="flex justify-between text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <span>Weekly growth budget</span>
                <span>${weeklyGrowthBudget.toLocaleString()}</span>
              </span>
              <input
                type="range"
                min="1000"
                max="10000"
                step="250"
                value={weeklyGrowthBudget}
                onChange={(e) => setWeeklyGrowthBudget(Number(e.target.value))}
                className="mt-3 w-full accent-emerald-600"
              />
            </label>
            <label className="block rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
              <span className="flex justify-between text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <span>Minimum LTV:CAC guardrail</span>
                <span>{minLtvToCacRatio.toFixed(1)}x</span>
              </span>
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={minLtvToCacRatio}
                onChange={(e) => setMinLtvToCacRatio(Number(e.target.value))}
                className="mt-3 w-full accent-emerald-600"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Allocated</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                ${weeklyBudgetPlan.allocatedBudget.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Held back</p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-600">
                ${weeklyBudgetPlan.unallocatedBudget.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Lead channel</p>
              <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                {recommendedChannel?.label ?? "No safe channel"}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {weeklyBudgetPlan.allocations.map((allocation) => {
              const allocationPercent =
                weeklyGrowthBudget > 0
                  ? Math.round((allocation.recommendedWeeklyBudget / weeklyGrowthBudget) * 100)
                  : 0;

              return (
                <div key={allocation.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{allocation.label}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          allocation.eligible
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
                            : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200"
                        }`}>
                          {allocation.eligible ? "Eligible" : "Hold spend"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        CAC ${allocation.baselineCAC} → ${allocation.adjustedCAC} after {allocation.previewLiftPercent}% preview lift · LTV:CAC {allocation.ltvToCacRatio.toFixed(2)}x · Profit after CAC ${allocation.profitAfterCAC.toFixed(2)}
                      </p>
                      {allocation.blockers.length > 0 && (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          Blocked: {allocation.blockers.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-mono text-xl font-bold text-gray-900 dark:text-white">
                        ${allocation.recommendedWeeklyBudget.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {allocationPercent}% of budget · cap ${allocation.weeklyBudgetCap.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className={`h-2 rounded-full ${allocation.eligible ? "bg-emerald-500" : "bg-red-300"}`}
                      style={{ width: `${Math.min(allocationPercent, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-600 dark:text-gray-300">
            This is a Phase 1 allocator: it uses the shared finance math and room-preview assumptions today; the Phase 2 path is persisted channel cohorts with actual CAC and conversion lift.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">SaaS & Platform Scalability</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>CAC:</strong> AI ad bidding + automated A/B testing. Target &lt;$12 per new buyer.</li>
          <li><strong>LTV:</strong> Automated retention + algorithmic recommendations. Target $150+ (~2 purchases/year).</li>
          <li><strong>Artist Acquisition Cost:</strong> Near zero via digital outreach bots and self-serve onboarding.</li>
          <li><strong>LTV:CAC Ratio:</strong> Target 12:1+ at steady state.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Path to High-Margin Profitability</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Phase 1 (Agile POD):</strong> External APIs (Printful, Gelato) for 100% fulfillment. Zero Capex, validates platform.</li>
          <li><strong>Phase 2 (Hybrid Volume):</strong> Top-selling SKUs printed in-house or via bulk partners — +15–20% platform margin.</li>
          <li><strong>Phase 3 (Software Licensing):</strong> License AI capture software to galleries as pure SaaS ($200–500/mo per institution).</li>
        </ol>
      </section>
    </div>
  );
}
