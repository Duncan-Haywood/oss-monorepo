"use client";

import { useMemo, useState } from "react";
import { compareArtistPayoutModels } from "@/lib/marketplace";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export default function ArtistPitch() {
  const [retailPrice, setRetailPrice] = useState(100);
  const [fulfillmentCost, setFulfillmentCost] = useState(30);
  const [monthlyOrders, setMonthlyOrders] = useState(25);

  const payoutComparison = useMemo(
    () =>
      compareArtistPayoutModels({
        retailPrice,
        fulfillmentCost,
        monthlyOrders,
      }),
    [retailPrice, fulfillmentCost, monthlyOrders],
  );
  const podAlternatives = payoutComparison.models.filter((model) => model.isPodAlternative);
  const artfinderBenchmark = payoutComparison.models.find((model) => model.id === "artfinder-original");
  const maxMonthlyPayout = Math.max(
    payoutComparison.printAtelier.monthlyArtistPayout,
    ...payoutComparison.models.map((model) => model.monthlyArtistPayout),
  );
  const isPayoutProofStrong = payoutComparison.blockers.length === 0;

  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">The Artist Pitch (Software First)</h1>

      <section>
        <h2 className="text-2xl font-semibold">The One-Liner</h2>
        <p className="text-xl italic text-gray-600 dark:text-gray-300">
          "Send us a print-quality file of your painting. We build the listing, sync it to Meta, Google, and Pinterest catalogs, route each order to a print partner, and pay you 30% of the net profit through Stripe. You just keep painting."
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Not yet built: the in-app capture step that would turn a phone photograph into a print-ready master. Until it ships, the artist supplies their own high-resolution file.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Your Reality vs. Our Software</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2">The Old Way</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Sell an original once, never make money from it again.</li>
              <li>Spend $500+ on professional studio photography to digitize.</li>
              <li>Spend hours formatting files, writing listings, and building a Shopify site.</li>
              <li>Pack boxes, buy tape, and stand in line at the post office.</li>
            </ul>
          </div>
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">The Print Atelier Platform</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Turn one painting into a recurring digital income stream.</li>
              <li>Planned, not yet built: snap a photo in our app and have it prepared for print. Today you upload your own high-resolution file.</li>
              <li>Our software builds your listing page and SEO from your catalog entry. Room mockups are planned, not yet built.</li>
              <li>Orders print globally via our API partners and ship directly to the buyer.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">What We Handle (Everything but the Art)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Image Enhancement (planned, not yet built):</strong> Color correction, deskewing, and upscaling. Today you send a print-quality file.</li>
          <li><strong>Digital Marketing:</strong> Listing pages and SEO generated from your catalog entry, plus catalog sync to Meta, Google, and Pinterest when credentials are configured. Programmatic ad buying and social posting are planned.</li>
          <li><strong>Global Logistics:</strong> Print production, packaging, and international shipping.</li>
          <li><strong>Customer Support:</strong> Handling returns, damages, and buyer inquiries.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Transparent Dashboard</h2>
        <p>No more guessing or waiting for quarterly checks. You get a real-time software dashboard showing:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Live view of prints sold and geographic data.</li>
          <li>Exact breakdown of gross sale, printing costs, and your 30% net profit share.</li>
          <li>One-click payouts to your bank account via our Stripe integration.</li>
        </ul>
      </section>

      <section className="not-prose rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
              Artist payout trust lab
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">
              Show the artist exactly why 30% of net profit can beat POD royalties
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
              Adjust price, POD cost, and monthly orders before outreach. The pitch only leads with payout proof when
              Print Atelier beats the best POD marketplace benchmark.
            </p>
          </div>
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${
              isPayoutProofStrong
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-100"
            }`}
          >
            {payoutComparison.recommendation}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Retail print price",
              value: retailPrice,
              min: 45,
              max: 180,
              step: 5,
              onChange: setRetailPrice,
              display: formatCurrency(retailPrice),
            },
            {
              label: "POD + packaging cost",
              value: fulfillmentCost,
              min: 15,
              max: 80,
              step: 5,
              onChange: setFulfillmentCost,
              display: formatCurrency(fulfillmentCost),
            },
            {
              label: "Monthly orders",
              value: monthlyOrders,
              min: 5,
              max: 100,
              step: 5,
              onChange: setMonthlyOrders,
              display: monthlyOrders.toString(),
            },
          ].map((control) => (
            <label
              key={control.label}
              className="rounded-xl border border-white/80 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <span className="flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-200">
                {control.label}
                <span className="text-blue-700 dark:text-blue-300">{control.display}</span>
              </span>
              <input
                className="mt-4 w-full accent-blue-600"
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={control.value}
                onChange={(event) => control.onChange(Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Print Atelier
                </p>
                <h3 className="mt-1 text-3xl font-bold text-gray-950 dark:text-white">
                  {formatCurrency(payoutComparison.printAtelier.artistPayoutPerOrder)} per print
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {payoutComparison.printAtelier.basis}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-right dark:bg-emerald-950/60">
                <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Monthly artist payout
                </p>
                <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-100">
                  {formatCurrency(payoutComparison.printAtelier.monthlyArtistPayout)}
                </p>
              </div>
            </div>
            <div className="mt-5 h-3 rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-3 rounded-full bg-emerald-500"
                style={{
                  width: `${Math.max(
                    8,
                    (payoutComparison.printAtelier.monthlyArtistPayout / maxMonthlyPayout) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
              {isPayoutProofStrong
                ? `${formatCurrency(
                    payoutComparison.podAdvantagePerOrder,
                  )} more per print than the strongest POD benchmark.`
                : payoutComparison.blockers.join(", ")}
            </p>
          </div>

          <div className="space-y-3">
            {podAlternatives.map((model) => (
              <div
                key={model.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950 dark:text-white">{model.label}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{model.basis}</p>
                  </div>
                  <p className="text-right text-sm font-bold text-gray-800 dark:text-gray-100">
                    {formatCurrency(model.artistPayoutPerOrder)}
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">per print</span>
                  </p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-blue-400"
                    style={{
                      width: `${Math.max(8, (model.monthlyArtistPayout / maxMonthlyPayout) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {artfinderBenchmark && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white/70 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
            <strong className="text-gray-900 dark:text-white">Context, not a POD equivalent:</strong>{" "}
            {artfinderBenchmark.label} can show {formatCurrency(artfinderBenchmark.artistPayoutPerOrder)} per
            sale, but the artist carries high original-sale and fulfillment workload. Print Atelier keeps the
            low-burden POD promise visible.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold">The Guarantee</h2>
        <p>You always keep your original artwork. You retain all copyright. We only make money when you make money.</p>
      </section>
    </div>
  );
}
