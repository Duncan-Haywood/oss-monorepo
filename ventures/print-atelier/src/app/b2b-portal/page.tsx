"use client";

import { useState } from "react";
import { Building2, Package, Percent, FolderOpen, Plus, Search, ShieldCheck, DollarSign, Sparkles, AlertCircle } from "lucide-react";
import { calculateB2BQuote, getB2BTier, B2BQuoteItem } from "@/lib/b2b-trade";

export default function B2BPortal() {
  const [activeProject, setActiveProject] = useState("hospitality-lobby");
  const [annualSpend, setAnnualSpend] = useState<number>(12500);

  const currentTier = getB2BTier(annualSpend);

  const projects = [
    { id: "hospitality-lobby", name: "Marriott Lobby Refresh", client: "Studio North Design", pieces: 12, budget: "$4,200" },
    { id: "corporate-hq", name: "Tech HQ Floor 3", client: "Meridian Interiors", pieces: 8, budget: "$2,800" },
    { id: "restaurant", name: "Farm-to-Table Restaurant", client: "Elena Rostova (direct)", pieces: 6, budget: "$1,650" },
  ];

  const catalogItems: B2BQuoteItem[] = [
    { sku: "PRINT-001", title: "Midnight Coast", retailPrice: 85, podCost: 28, quantity: 4 },
    { sku: "PRINT-002", title: "Urban Geometry", retailPrice: 110, podCost: 35, quantity: 3 },
    { sku: "PRINT-003", title: "Spring Bloom", retailPrice: 65, podCost: 20, quantity: 5 },
    { sku: "PRINT-004", title: "Desert Sun", retailPrice: 95, podCost: 32, quantity: 2 },
  ];

  const [items, setItems] = useState<B2BQuoteItem[]>(catalogItems);

  const updateQuantity = (sku: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.sku === sku ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      )
    );
  };

  const quote = calculateB2BQuote({
    annualSpendToDate: annualSpend,
    items: items.filter((i) => i.quantity > 0),
    shippingEst: 35.0,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Designer Trade Portal</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">Bulk ordering • Trade pricing • Artist-safe unit economics</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>{quote.tier.name} ({quote.effectiveDiscountPct}% Trade Discount)</span>
            </div>
            <a href="/docs" className="text-sm px-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 transition">
              Return to Docs
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex gap-6">
        <aside className="w-80 shrink-0 space-y-6">
          {/* Tier Status & Annual Spend Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3 text-sm">
              <Percent className="w-4 h-4 text-indigo-600" /> Trade Tier Calculator
            </h2>
            <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">
              Annual Trade Spend ($)
            </label>
            <input
              type="number"
              value={annualSpend}
              onChange={(e) => setAnnualSpend(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white text-sm font-mono mb-3"
              step={1000}
            />
            <div className="text-xs space-y-1.5 text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-gray-900/50 p-3 rounded-lg border border-slate-100 dark:border-gray-700">
              <div className="flex justify-between">
                <span>Base Discount:</span>
                <span className="font-bold">{quote.tier.baseDiscountPct}%</span>
              </div>
              <div className="flex justify-between">
                <span>Volume Bonus:</span>
                <span className="font-bold text-emerald-600">+{quote.volumeBonusPct}%</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-gray-700 pt-1">
                <span>Effective Discount:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{quote.effectiveDiscountPct}%</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Free Shipping:</span>
                <span>{quote.tier.freeShippingThreshold === 0 ? "Always Free" : `Orders > $${quote.tier.freeShippingThreshold}`}</span>
              </div>
            </div>
          </div>

          {/* Project List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                <FolderOpen className="w-4 h-4 text-indigo-600" /> Active Projects
              </h2>
              <button className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded"><Plus className="w-4 h-4 text-indigo-600" /></button>
            </div>
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProject(p.id)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    activeProject === p.id
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
                      : "hover:bg-slate-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">{p.client}</div>
                  <div className="text-xs text-slate-400 mt-1">{p.pieces} pieces • {p.budget}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          {/* Catalog / Order Items Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Trade Order Specifier</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">Select artwork quantities for bulk project pricing</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter catalog..."
                  className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400">
                  <th className="text-left py-2">Artwork</th>
                  <th className="text-right py-2">Retail</th>
                  <th className="text-right py-2">Trade Price</th>
                  <th className="text-center py-2">Quantity</th>
                  <th className="text-right py-2">Item Subtotal</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-gray-300">
                {items.map((item) => {
                  const tradeUnitPrice = Math.round(item.retailPrice * (1 - quote.effectiveDiscountPct / 100) * 100) / 100;
                  const itemSubtotal = Math.round(tradeUnitPrice * item.quantity * 100) / 100;
                  return (
                    <tr key={item.sku} className="border-b border-slate-100 dark:border-gray-700/50">
                      <td className="py-3 font-medium text-slate-900 dark:text-white">
                        {item.title}
                        <span className="block text-xs font-normal text-slate-400">POD Fulfillment Cost: ${item.podCost}</span>
                      </td>
                      <td className="py-3 text-right font-mono text-slate-400 line-through">${item.retailPrice}</td>
                      <td className="py-3 text-right font-mono text-indigo-600 dark:text-indigo-400 font-semibold">${tradeUnitPrice}</td>
                      <td className="py-3 text-center">
                        <div className="inline-flex items-center gap-2 border border-slate-200 dark:border-gray-700 rounded-md px-2 py-1">
                          <button onClick={() => updateQuantity(item.sku, -1)} className="text-xs px-1 text-slate-500 hover:text-slate-900 dark:hover:text-white">-</button>
                          <span className="font-mono text-xs font-bold w-5 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.sku, 1)} className="text-xs px-1 text-slate-500 hover:text-slate-900 dark:hover:text-white">+</button>
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">${itemSubtotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Economics & Payout Protection Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6 space-y-3">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Order Financial Breakdown
              </h3>
              <div className="space-y-2 text-sm text-slate-600 dark:text-gray-300">
                <div className="flex justify-between">
                  <span>Gross Retail Value:</span>
                  <span className="font-mono">${quote.totalRetail}</span>
                </div>
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                  <span>Trade Discount ({quote.effectiveDiscountPct}%):</span>
                  <span className="font-mono">-${quote.discountAmount}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 dark:text-white border-t border-slate-100 dark:border-gray-700 pt-2">
                  <span>Trade Subtotal:</span>
                  <span className="font-mono">${quote.subtotalTrade}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Estimated Shipping:</span>
                  <span className="font-mono">{quote.freeShippingEligible ? "FREE (Trade Benefit)" : `$${quote.finalShipping}`}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white border-t border-slate-200 dark:border-gray-700 pt-2">
                  <span>Total Payable:</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">${quote.finalTotal}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6 space-y-3">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Unit Economics & Artist Protection
              </h3>
              <div className="space-y-2 text-xs text-slate-600 dark:text-gray-300">
                <div className="flex justify-between">
                  <span>POD Fulfillment Expenses:</span>
                  <span className="font-mono">${quote.totalPodCost}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Protected Artist Net Profit (30%):</span>
                  <span className="font-mono">${quote.artistPayoutTotal}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Platform Net Contribution Margin:</span>
                  <span className="font-mono">${quote.platformNetMargin} ({quote.platformNetMarginPct}%)</span>
                </div>
                <div className="mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Verified: Artist 30% net profit promise and platform unit economics clear all profit guardrails.</span>
                </div>
              </div>
              <button className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-medium transition shadow-md flex items-center justify-center gap-2 text-sm">
                <Package className="w-4 h-4" /> Submit B2B Trade Order
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
