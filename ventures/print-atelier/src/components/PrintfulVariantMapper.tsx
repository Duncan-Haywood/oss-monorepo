"use client";

import { useMemo, useState } from "react";
import { Link2, Package } from "lucide-react";
import {
  buildPrintfulVariantMapDashboard,
  defaultPrintfulVariantMappings,
  loadPrintfulVariantMappingsFromStorage,
  savePrintfulVariantMappingsToStorage,
  upsertPrintfulVariantMapping,
  type PrintfulVariantMapping,
} from "@/lib/printful-variant-map";

export default function PrintfulVariantMapper() {
  const [mappings, setMappings] = useState<PrintfulVariantMapping[]>(() =>
    loadPrintfulVariantMappingsFromStorage(),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const dashboard = useMemo(
    () => buildPrintfulVariantMapDashboard(undefined, mappings),
    [mappings],
  );

  function handleSave(slug: string, title: string) {
    const variantId = drafts[slug]?.trim();
    if (!variantId) return;
    const next = upsertPrintfulVariantMapping(
      slug,
      variantId,
      `Print — ${title}`,
      "18×24 in",
      mappings,
    );
    setMappings(next);
    savePrintfulVariantMappingsToStorage(next);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[slug];
      return copy;
    });
  }

  function handleReset() {
    setMappings(defaultPrintfulVariantMappings);
    savePrintfulVariantMappingsToStorage(defaultPrintfulVariantMappings);
    setDrafts({});
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Package className="h-6 w-6 text-indigo-600" />
          <div>
            <h3 className="text-lg font-bold text-stone-900">Printful variant mapping</h3>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Map each live catalog slug to a Printful product variant ID so webhook fulfillment
              submits real POD orders instead of placeholder IDs.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Live SKUs</p>
            <p className="text-2xl font-bold">{dashboard.liveCatalogCount}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Mapped</p>
            <p className="text-2xl font-bold text-emerald-700">{dashboard.mappedCount}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Coverage</p>
            <p className="text-2xl font-bold">{dashboard.mappingCoveragePercent}%</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Fulfillment gate</p>
            <p
              className={`text-sm font-semibold ${dashboard.fulfillmentReady ? "text-emerald-700" : "text-amber-700"}`}
            >
              {dashboard.fulfillmentReady ? "Ready" : "Incomplete"}
            </p>
          </div>
        </div>

        {dashboard.blockers.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
            {dashboard.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Catalog slug</th>
              <th className="px-4 py-3">Artwork</th>
              <th className="px-4 py-3">Printful variant ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.rows.map((row) => (
              <tr key={row.artwork.slug} className="border-t border-stone-100">
                <td className="px-4 py-3 font-mono text-xs">{row.artwork.slug}</td>
                <td className="px-4 py-3">{row.artwork.title}</td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    aria-label={`Printful variant ID for ${row.artwork.title}`}
                    className="w-full rounded-lg border border-stone-200 px-2 py-1 font-mono text-xs"
                    placeholder={row.mapping?.printfulVariantId ?? "e.g. 4011"}
                    value={drafts[row.artwork.slug] ?? row.mapping?.printfulVariantId ?? ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.artwork.slug]: event.target.value,
                      }))
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      row.mapped
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.mapped ? "mapped" : "missing"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleSave(row.artwork.slug, row.artwork.title)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    <Link2 className="h-3 w-3" />
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleReset}
        className="text-xs text-stone-500 underline hover:text-stone-700"
      >
        Reset to default seed mappings
      </button>
    </section>
  );
}
