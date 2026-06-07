"use client";

import { useState } from "react";

type PrintSize = { name: string; price: number; cost: number };

export default function RevenueModel() {
  const [printSize, setPrintSize] = useState("16x20");
  const [retailPrice, setRetailPrice] = useState(85);
  const [podCost, setPodCost] = useState(28);
  const [monthlyOrders, setMonthlyOrders] = useState(500);
  const [avgOrderValue, setAvgOrderValue] = useState(85);

  const paymentFee = retailPrice * 0.03;
  const aiComputeCost = 0.35;
  const netProfit = retailPrice - paymentFee - podCost - aiComputeCost;
  const artistShare = netProfit * 0.3;
  const platformGross = netProfit * 0.7;
  const margin = retailPrice > 0 ? ((netProfit / retailPrice) * 100).toFixed(1) : "0";

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

  const monthlyGMV = monthlyOrders * avgOrderValue;
  const monthlyNetProfit = monthlyOrders * (avgOrderValue - avgOrderValue * 0.03 - 28 - 0.35);
  const monthlyPlatformRevenue = monthlyNetProfit * 0.7;
  const monthlyArtistPayouts = monthlyNetProfit * 0.3;
  const monthlyFixedCosts = 3500;
  const monthlyMarketing = monthlyOrders * 8;
  const monthlyEBITDA = monthlyPlatformRevenue - monthlyFixedCosts - monthlyMarketing;

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
              <span>Payment Processing (~3%)</span> <span>-${paymentFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400">
              <span>POD Print + Shipping</span> <span>-${podCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400">
              <span>AI Compute (upscale + mockups)</span> <span>-${aiComputeCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t mt-1 text-gray-800 dark:text-gray-200">
              <span>Net Profit</span> <span>${netProfit.toFixed(2)} ({margin}% margin)</span>
            </div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400 mt-2">
              <span>Artist Share (30%)</span> <span>${artistShare.toFixed(2)}</span>
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
          <div className="font-mono text-sm space-y-1 text-gray-800 dark:text-gray-200">
            <div className="flex justify-between"><span>GMV</span><span>${monthlyGMV.toLocaleString()}</span></div>
            <div className="flex justify-between text-green-600 dark:text-green-400"><span>Platform Revenue (70% net)</span><span>${monthlyPlatformRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400"><span>Artist Payouts (30% net)</span><span>${monthlyArtistPayouts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="flex justify-between text-red-600 dark:text-red-400"><span>Fixed Costs (infra, tools, 1 FTE)</span><span>-${monthlyFixedCosts.toLocaleString()}</span></div>
            <div className="flex justify-between text-red-600 dark:text-red-400"><span>Marketing (@ $8/order blended)</span><span>-${monthlyMarketing.toLocaleString()}</span></div>
            <div className={`flex justify-between font-bold pt-2 border-t mt-2 ${monthlyEBITDA >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              <span>Est. Monthly EBITDA</span>
              <span>${monthlyEBITDA.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <p className="text-xs mt-3 text-gray-500">Break-even at ~{Math.ceil((monthlyFixedCosts + monthlyMarketing) / (platformGross || 1))} orders/mo at current unit economics. Scales sub-linearly as artist-driven CAC dominates.</p>
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
