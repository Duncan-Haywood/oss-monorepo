"use client";

import { useMemo, useState } from "react";
import { Calculator, TrendingUp } from "lucide-react";
import { calculateArtistEarningsForecast, catalogArtworks } from "@/lib/marketplace";

export default function ArtistEarningsCalculator() {
  const defaultArtwork = catalogArtworks.find((item) => item.slug === "midnight-coast") ?? catalogArtworks[0];
  const [retailPrice, setRetailPrice] = useState(defaultArtwork.retailPrice);
  const [fulfillmentCost, setFulfillmentCost] = useState(defaultArtwork.fulfillmentCost);
  const [monthlyOrders, setMonthlyOrders] = useState(defaultArtwork.salesLast30Days);

  const forecast = useMemo(
    () =>
      calculateArtistEarningsForecast({
        retailPrice,
        fulfillmentCost,
        monthlyOrders,
      }),
    [fulfillmentCost, monthlyOrders, retailPrice],
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-stone-200 bg-blue-50 px-6 py-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-bold text-stone-900">Artist earnings calculator</h3>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Model your 30% net-profit share before listing goes live. Adjust price, POD cost, and
          expected monthly orders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-stone-700">
            Retail price: ${retailPrice}
            <input
              type="range"
              min={45}
              max={200}
              value={retailPrice}
              onChange={(event) => setRetailPrice(Number(event.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            POD fulfillment cost: ${fulfillmentCost}
            <input
              type="range"
              min={18}
              max={45}
              value={fulfillmentCost}
              onChange={(event) => setFulfillmentCost(Number(event.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Expected monthly orders: {monthlyOrders}
            <input
              type="range"
              min={0}
              max={120}
              value={monthlyOrders}
              onChange={(event) => setMonthlyOrders(Number(event.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Per-print artist share</p>
            <p className="text-3xl font-bold text-emerald-900">
              ${forecast.perPrintArtistShare.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">{forecast.payoutProofLine}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500">Monthly earnings</p>
              <p className="text-xl font-bold text-stone-900">
                ${forecast.monthlyEarnings.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500">Annual run-rate</p>
              <p className="text-xl font-bold text-stone-900">
                ${forecast.annualEarnings.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-dashed border-stone-300 p-3 text-xs text-stone-600">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p>
              Margin: {forecast.marginPercent.toFixed(1)}% after fulfillment, payment fees, and AI
              compute. Platform retains 70% of net profit; you receive 30% on every print sold.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
