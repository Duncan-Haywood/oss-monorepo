"use client";

import { buildCompetitorBattlecards, type CompetitivePosition } from "@/lib/competitors";
import { useMemo, useState } from "react";

function PositionBadge({ position }: { position: CompetitivePosition }) {
  const styles = {
    win: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    parity: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    lose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${styles[position]}`}>
      {position}
    </span>
  );
}

export default function CompetitiveBattlecards() {
  const [retailPrice, setRetailPrice] = useState(85);
  const [fulfillmentCost, setFulfillmentCost] = useState(28);
  const [monthlyOrders, setMonthlyOrders] = useState(12);

  const deck = useMemo(
    () =>
      buildCompetitorBattlecards({
        retailPrice,
        fulfillmentCost,
        monthlyOrders,
      }),
    [retailPrice, fulfillmentCost, monthlyOrders],
  );

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
          GTM & sales enablement
        </p>
        <h1 className="text-3xl font-bold mt-1">Competitive Battlecards</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Saatchi, Artfinder, Society6, and Redbubble compared on artist economics and software moat —
          wired to the same payout math as artist outreach, admin guardrails, and investor dashboard.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Retail price ($)</span>
          <input
            type="range"
            min={45}
            max={150}
            value={retailPrice}
            onChange={(e) => setRetailPrice(Number(e.target.value))}
            className="w-full"
          />
          <span className="font-semibold tabular-nums">${retailPrice}</span>
        </label>
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">POD cost ($)</span>
          <input
            type="range"
            min={15}
            max={45}
            value={fulfillmentCost}
            onChange={(e) => setFulfillmentCost(Number(e.target.value))}
            className="w-full"
          />
          <span className="font-semibold tabular-nums">${fulfillmentCost}</span>
        </label>
        <label className="text-sm">
          <span className="text-gray-500 block mb-1">Monthly orders</span>
          <input
            type="range"
            min={4}
            max={40}
            value={monthlyOrders}
            onChange={(e) => setMonthlyOrders(Number(e.target.value))}
            className="w-full"
          />
          <span className="font-semibold tabular-nums">{monthlyOrders}</span>
        </label>
        <div className="flex flex-col justify-center">
          <p className="text-xs text-gray-500 uppercase">vs best POD</p>
          <p className="text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            ${deck.podAdvantagePerOrder.toFixed(2)}/order
          </p>
          <PositionBadge position={deck.overallPosition} />
        </div>
      </section>

      <p className="text-sm text-gray-600 dark:text-gray-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg px-4 py-3">
        <strong>Recommendation:</strong> {deck.recommendation}. Best POD benchmark: {deck.bestPodLabel}.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {deck.cards.map((card) => (
          <article
            key={`${card.id}-${card.name}`}
            className={`border rounded-xl p-5 ${
              card.id === "print-atelier"
                ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-lg font-bold">{card.name}</h2>
                <p className="text-xs text-gray-500">{card.category}</p>
              </div>
              <PositionBadge position={card.position} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{card.artistModel}</p>
            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                <p className="text-xs text-gray-500">Per order</p>
                <p className="font-semibold tabular-nums">${card.artistPayoutPerOrder.toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                <p className="text-xs text-gray-500">Monthly</p>
                <p className="font-semibold tabular-nums">${card.monthlyArtistPayout.toFixed(2)}</p>
              </div>
            </div>
            {card.id !== "print-atelier" && (
              <p className="text-xs text-gray-500 mb-3">
                Δ vs Print Atelier:{" "}
                <span
                  className={
                    card.payoutDeltaVsPrintAtelier >= 0 ? "text-rose-600" : "text-emerald-600"
                  }
                >
                  {card.payoutDeltaVsPrintAtelier >= 0 ? "-" : "+"}$
                  {Math.abs(card.payoutDeltaVsPrintAtelier).toFixed(2)}/order
                </span>
              </p>
            )}
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200">Their weakness</p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                  {card.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200">Our edge</p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                  {card.printAtelierEdge.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200">Objection handlers</p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                  {card.objectionHandlers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">{card.sourceNote}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
