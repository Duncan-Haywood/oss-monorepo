"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon, Layout, Sparkles } from "lucide-react";
import {
  catalogArtworks,
  compareProductDetailPreviewModes,
  type CatalogArtwork,
} from "@/lib/marketplace";

type ProductDetailPreviewCTAProps = {
  artwork?: CatalogArtwork;
  compact?: boolean;
};

export default function ProductDetailPreviewCTA({
  artwork: artworkProp,
  compact = false,
}: ProductDetailPreviewCTAProps) {
  const liveArtworks = catalogArtworks.filter((item) => item.status === "Live");
  const [selectedSlug, setSelectedSlug] = useState(
    artworkProp?.slug ?? liveArtworks[0]?.slug ?? "midnight-coast",
  );
  const [previewEngagementRate, setPreviewEngagementRate] = useState(30);
  const [conversionLiftPercent, setConversionLiftPercent] = useState(50);

  const artwork =
    artworkProp ??
    liveArtworks.find((item) => item.slug === selectedSlug) ??
    liveArtworks[0];

  const comparison = useMemo(
    () =>
      artwork
        ? compareProductDetailPreviewModes(artwork, {
            previewEngagementRate,
            conversionLiftPercent,
          })
        : null,
    [artwork, conversionLiftPercent, previewEngagementRate],
  );

  if (!artwork || !comparison) {
    return null;
  }

  const modes = [comparison.flat, comparison.roomPreview];

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ${
        compact ? "" : "mt-8"
      }`}
    >
      <div className="border-b border-stone-200 bg-stone-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Product detail preview CTA
        </p>
        <h3 className="mt-1 text-lg font-bold text-stone-900">
          Flat listing vs in-room preview for {artwork.title}
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Compare conversion and add-to-cart behavior before scaling paid traffic to this SKU.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          {!artworkProp && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {liveArtworks.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    selectedSlug === item.slug
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 hover:border-stone-400"
                  }`}
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className={selectedSlug === item.slug ? "text-stone-300" : "text-stone-600"}>
                    {item.hasRoomMockups ? "Room mockups ready" : "Mockups pending"}
                  </p>
                </button>
              ))}
            </div>
          )}

          {!compact && (
            <div className="space-y-3 rounded-xl border border-stone-200 p-4">
              <label className="block text-sm font-medium text-stone-700">
                Preview engagement rate: {previewEngagementRate}%
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={previewEngagementRate}
                  onChange={(event) => setPreviewEngagementRate(Number(event.target.value))}
                  className="mt-2 w-full accent-indigo-600"
                />
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Conversion lift from preview: {conversionLiftPercent}%
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={conversionLiftPercent}
                  onChange={(event) => setConversionLiftPercent(Number(event.target.value))}
                  className="mt-2 w-full accent-indigo-600"
                />
              </label>
            </div>
          )}

          <div className={`aspect-[4/5] rounded-xl ${artwork.imageClass} relative overflow-hidden`}>
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900/50 to-transparent" />
            <div className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-800">
              {comparison.recommendedMode === "room-preview"
                ? "Recommended: room preview CTA"
                : "Recommended: flat image CTA"}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {modes.map((mode) => (
            <div
              key={mode.mode}
              className={`rounded-xl border p-4 ${
                mode.recommended
                  ? "border-indigo-300 bg-indigo-50/60"
                  : "border-stone-200 bg-stone-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {mode.mode === "room-preview" ? (
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                  ) : (
                    <Layout className="h-4 w-4 text-stone-500" />
                  )}
                  <p className="font-semibold text-stone-900">{mode.label}</p>
                </div>
                {mode.recommended && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Recommended
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-stone-600">Est. conversion</p>
                  <p className="font-mono font-semibold text-stone-900">
                    {mode.estimatedConversionRate.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-stone-600">Est. add-to-cart</p>
                  <p className="font-mono font-semibold text-stone-900">
                    {mode.estimatedAddToCartRate.toFixed(2)}%
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={!mode.ctaEnabled}
                className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  mode.ctaEnabled
                    ? "bg-stone-900 text-white hover:bg-stone-700"
                    : "cursor-not-allowed bg-stone-200 text-stone-600"
                }`}
              >
                {mode.ctaLabel}
              </button>

              {mode.blockers.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Blockers: {mode.blockers.join(" · ")}
                </p>
              )}

              {mode.conversionLiftVsFlat > 0 && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  +{mode.conversionLiftVsFlat.toFixed(1)}% conversion vs flat image
                </p>
              )}
            </div>
          ))}

          <div className="flex items-start gap-2 rounded-xl border border-dashed border-stone-300 p-3 text-xs text-stone-600">
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <p>
              Room-preview CTAs only unlock when mockups and proof are live. Blocked SKUs should
              default to flat imagery in ads and SEO until the catalog ops queue clears blockers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
