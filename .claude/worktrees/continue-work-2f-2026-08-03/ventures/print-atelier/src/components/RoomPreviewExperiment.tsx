"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, DollarSign, Image as ImageIcon, SlidersHorizontal, TrendingUp } from "lucide-react";
import { calculateRoomPreviewExperiment, catalogArtworks } from "@/lib/marketplace";

const previewArtworks = catalogArtworks.filter((artwork) => artwork.status === "Live" || !artwork.hasRoomMockups);

export default function RoomPreviewExperiment() {
  const [selectedSlug, setSelectedSlug] = useState("midnight-coast");
  const [previewEngagementRate, setPreviewEngagementRate] = useState(30);
  const [conversionLiftPercent, setConversionLiftPercent] = useState(50);
  const [baselineCAC, setBaselineCAC] = useState(68);

  const selectedArtwork =
    previewArtworks.find((artwork) => artwork.slug === selectedSlug) ?? previewArtworks[0];
  const experiment = useMemo(
    () =>
      calculateRoomPreviewExperiment(selectedArtwork, {
        monthlyVisitors: 10000,
        baselineConversionRate: 2,
        baselineCAC,
        previewEngagementRate,
        conversionLiftPercent,
        purchasesPerCustomer: 1.6,
      }),
    [baselineCAC, conversionLiftPercent, previewEngagementRate, selectedArtwork],
  );
  const isBlocked = experiment.blockers.length > 0;

  return (
    <section className="mt-12 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative min-h-[430px] bg-stone-900 p-8 text-white md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(129,140,248,0.35),transparent_35%),linear-gradient(135deg,rgba(28,25,23,0.95),rgba(68,64,60,0.92))]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100">
                <ImageIcon className="h-3.5 w-3.5" />
                Room Preview Conversion Lab
              </p>
              <h2 className="max-w-xl text-3xl font-serif font-bold md:text-4xl">
                Turn buyer confidence into CAC math before scaling ads.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-stone-300">
                Model how a "view on my wall" interaction changes conversion rate, effective CAC, artist payout, and contribution after acquisition.
              </p>
            </div>

            <div className="mt-8 rounded-3xl border border-white/15 bg-stone-950/35 p-5 backdrop-blur">
              <div className="relative mx-auto aspect-[5/3] max-w-xl overflow-hidden rounded-2xl bg-gradient-to-br from-stone-200 via-stone-100 to-amber-100">
                <div className="absolute left-6 top-6 h-16 w-20 rounded-full bg-stone-300/70 blur-xl" />
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-stone-300/80 to-transparent" />
                <div className="absolute left-1/2 top-16 h-44 w-36 -translate-x-1/2 rounded-sm border-[10px] border-white bg-stone-100 shadow-2xl">
                  <div className={`h-full w-full ${selectedArtwork.imageClass}`} />
                </div>
                <div className="absolute bottom-5 left-5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-700 shadow">
                  {selectedArtwork.title} in-room preview
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-stone-700">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            Experiment inputs
          </div>

          <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {previewArtworks.map((artwork) => (
              <button
                key={artwork.slug}
                type="button"
                onClick={() => setSelectedSlug(artwork.slug)}
                className={`rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  selectedSlug === artwork.slug
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400"
                }`}
              >
                <span className="block text-sm font-semibold">{artwork.title}</span>
                <span className={selectedSlug === artwork.slug ? "text-xs text-stone-300" : "text-xs text-stone-500"}>
                  {artwork.hasRoomMockups ? "Mockups ready" : "Needs mockups"}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <RangeControl
              label="Preview engagement"
              value={previewEngagementRate}
              min={5}
              max={70}
              suffix="%"
              onChange={setPreviewEngagementRate}
            />
            <RangeControl
              label="Conversion lift on preview users"
              value={conversionLiftPercent}
              min={0}
              max={100}
              suffix="%"
              onChange={setConversionLiftPercent}
            />
            <RangeControl
              label="Baseline paid CAC"
              value={baselineCAC}
              min={10}
              max={120}
              prefix="$"
              onChange={setBaselineCAC}
            />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <MetricCard
              label="Projected orders"
              value={experiment.projectedOrders.toFixed(0)}
              detail={`+${experiment.incrementalOrders.toFixed(0)} from preview`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <MetricCard
              label="Adjusted CAC"
              value={`$${experiment.adjustedCAC.toFixed(2)}`}
              detail={`from $${baselineCAC}`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <MetricCard
              label="Blended conversion"
              value={`${experiment.blendedConversionRate.toFixed(2)}%`}
              detail="2.00% baseline"
              icon={<SlidersHorizontal className="h-4 w-4" />}
            />
            <MetricCard
              label="Artist upside"
              value={`$${experiment.monthlyIncrementalArtistPayout.toFixed(2)}`}
              detail="incremental payout/mo"
              icon={<ImageIcon className="h-4 w-4" />}
            />
          </div>

          <div
            className={`mt-5 rounded-2xl border p-4 ${
              isBlocked ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <div className="flex items-start gap-3">
              {isBlocked ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-bold">
                  {isBlocked ? "Do not count preview lift yet" : "Feed adjusted CAC into channel forecast"}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {isBlocked
                    ? `Blocked by: ${experiment.blockers.join(", ")}. Generate proofed mockups before using this SKU in paid room-preview experiments.`
                    : `At this lift, ${selectedArtwork.title} moves contribution after CAC to $${experiment.channelScenario.profitAfterCAC.toFixed(2)} per customer across 1.6 purchases.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix = "",
  prefix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  prefix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span>{label}</span>
        <span className="text-stone-900">
          {prefix}
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-indigo-600"
      />
    </label>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm">
        {icon}
      </div>
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{detail}</p>
    </div>
  );
}
