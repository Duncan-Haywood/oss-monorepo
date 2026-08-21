"use client";

import { useMemo, useState } from "react";
import { Globe2, Link2 } from "lucide-react";
import {
  buildGelatoVariantMapDashboard,
  defaultGelatoVariantMappings,
  loadGelatoVariantMappingsFromStorage,
  saveGelatoVariantMappingsToStorage,
  upsertGelatoVariantMapping,
  type GelatoVariantMapping,
} from "@/lib/gelato-variant-map";

export default function GelatoVariantMapper() {
  const [mappings, setMappings] = useState<GelatoVariantMapping[]>(() =>
    loadGelatoVariantMappingsFromStorage(),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const dashboard = useMemo(
    () => buildGelatoVariantMapDashboard(undefined, mappings),
    [mappings],
  );

  function handleSave(slug: string, title: string) {
    const productUid = drafts[slug]?.trim();
    if (!productUid) return;
    const next = upsertGelatoVariantMapping(
      slug,
      productUid,
      `Print — ${title}`,
      "18×24 in",
      mappings,
    );
    setMappings(next);
    saveGelatoVariantMappingsToStorage(next);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[slug];
      return copy;
    });
  }

  function handleReset() {
    setMappings(defaultGelatoVariantMappings);
    saveGelatoVariantMappingsToStorage(defaultGelatoVariantMappings);
    setDrafts({});
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Globe2 className="h-6 w-6 text-teal-600" />
          <div>
            <h3 className="text-lg font-bold text-stone-900">Gelato variant mapping</h3>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Map live catalog slugs to Gelato product UIDs for EU/APAC margin routing when checkout
              selects Gelato over Printful.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Live SKUs</p>
            <p className="text-2xl font-bold text-stone-900">{dashboard.liveCatalogCount}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Mapped</p>
            <p className="text-2xl font-bold text-emerald-700">{dashboard.mappedCount}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">Coverage</p>
            <p className="text-2xl font-bold text-stone-900">{dashboard.mappingCoveragePercent}%</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-500">EU routing gate</p>
            <p
              className={`text-sm font-semibold ${dashboard.euRoutingReady ? "text-emerald-700" : "text-amber-700"}`}
            >
              {dashboard.euRoutingReady ? "Ready" : "Incomplete"}
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
              <th className="px-4 py-3">Gelato product UID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="text-stone-900">
            {dashboard.rows.map((row) => (
              <tr key={row.artwork.slug} className="border-t border-stone-100">
                <td className="px-4 py-3 font-mono text-xs">{row.artwork.slug}</td>
                <td className="px-4 py-3">{row.artwork.title}</td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    aria-label={`Gelato product UID for ${row.artwork.title}`}
                    className="w-full rounded-lg border border-stone-200 px-2 py-1 font-mono text-xs"
                    placeholder={row.mapping?.gelatoProductUid ?? "e.g. gel_poster_18x24"}
                    value={drafts[row.artwork.slug] ?? row.mapping?.gelatoProductUid ?? ""}
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
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2 py-1 text-xs font-medium text-white hover:bg-teal-800"
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
        className="text-xs text-stone-500 dark:text-stone-400 underline hover:text-stone-700"
      >
        Reset to default seed mappings
      </button>
    </section>
  );
}
