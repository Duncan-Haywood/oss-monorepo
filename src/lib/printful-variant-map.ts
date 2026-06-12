import { catalogArtworks, type CatalogArtwork } from "./marketplace";

export type PrintfulVariantMapping = {
  catalogSlug: string;
  printfulVariantId: string;
  productName: string;
  size: string;
  updatedAt: string;
};

const STORAGE_KEY = "print-atelier-printful-variant-map";

/** Seed mappings for live catalog slugs — replace with Printful dashboard variant IDs in production. */
export const defaultPrintfulVariantMappings: PrintfulVariantMapping[] = [
  {
    catalogSlug: "midnight-coast",
    printfulVariantId: "4011",
    productName: "Enhanced Matte Paper Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "urban-geometry",
    printfulVariantId: "4012",
    productName: "Enhanced Matte Paper Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "spring-bloom",
    printfulVariantId: "4013",
    productName: "Enhanced Matte Paper Poster (12×16)",
    size: "12×16 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "desert-sun",
    printfulVariantId: "4014",
    productName: "Enhanced Matte Paper Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "city-at-dusk",
    printfulVariantId: "4015",
    productName: "Enhanced Matte Paper Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
];

export function serializePrintfulVariantMappings(mappings: PrintfulVariantMapping[]): string {
  return JSON.stringify(mappings);
}

export function parsePrintfulVariantMappings(raw: string | null): PrintfulVariantMapping[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PrintfulVariantMapping[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.catalogSlug === "string" &&
        typeof item.printfulVariantId === "string" &&
        item.printfulVariantId.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function loadPrintfulVariantMappingsFromStorage(): PrintfulVariantMapping[] {
  if (typeof window === "undefined") return [];
  const stored = parsePrintfulVariantMappings(window.localStorage.getItem(STORAGE_KEY));
  return stored.length > 0 ? stored : defaultPrintfulVariantMappings;
}

export function savePrintfulVariantMappingsToStorage(mappings: PrintfulVariantMapping[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializePrintfulVariantMappings(mappings));
}

export function mergePrintfulVariantMappings(
  base: PrintfulVariantMapping[],
  overrides: PrintfulVariantMapping[],
): PrintfulVariantMapping[] {
  const bySlug = new Map(base.map((item) => [item.catalogSlug, item]));
  for (const override of overrides) {
    bySlug.set(override.catalogSlug, override);
  }
  return Array.from(bySlug.values()).sort((a, b) => a.catalogSlug.localeCompare(b.catalogSlug));
}

export function resolvePrintfulVariantId(
  catalogSlug: string,
  mappings: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): string | null {
  const match = mappings.find((item) => item.catalogSlug === catalogSlug);
  if (!match?.printfulVariantId.trim()) {
    return null;
  }
  return match.printfulVariantId.trim();
}

export type PrintfulVariantMapRow = {
  artwork: CatalogArtwork;
  mapping: PrintfulVariantMapping | null;
  mapped: boolean;
  blockers: string[];
};

export type PrintfulVariantMapDashboard = {
  liveCatalogCount: number;
  mappedCount: number;
  unmappedCount: number;
  mappingCoveragePercent: number;
  fulfillmentReady: boolean;
  blockers: string[];
  rows: PrintfulVariantMapRow[];
};

export function buildPrintfulVariantMapDashboard(
  artworks: CatalogArtwork[] = catalogArtworks,
  mappings: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): PrintfulVariantMapDashboard {
  const liveArtworks = artworks.filter((artwork) => artwork.status === "Live");
  const mappingBySlug = new Map(mappings.map((item) => [item.catalogSlug, item]));

  const rows: PrintfulVariantMapRow[] = liveArtworks.map((artwork) => {
    const mapping = mappingBySlug.get(artwork.slug) ?? null;
    const blockers: string[] = [];
    if (!mapping) {
      blockers.push("No Printful variant ID mapped");
    } else if (!mapping.printfulVariantId.trim()) {
      blockers.push("Variant ID is empty");
    }
    return {
      artwork,
      mapping,
      mapped: blockers.length === 0,
      blockers,
    };
  });

  const mappedCount = rows.filter((row) => row.mapped).length;
  const unmappedCount = liveArtworks.length - mappedCount;
  const mappingCoveragePercent =
    liveArtworks.length > 0 ? Math.round((mappedCount / liveArtworks.length) * 100) : 0;

  const blockers = [
    ...rows
      .filter((row) => !row.mapped)
      .slice(0, 4)
      .map((row) => `${row.artwork.slug}: ${row.blockers.join(", ")}`),
  ];

  return {
    liveCatalogCount: liveArtworks.length,
    mappedCount,
    unmappedCount,
    mappingCoveragePercent,
    fulfillmentReady: unmappedCount === 0 && liveArtworks.length > 0,
    blockers,
    rows,
  };
}

export function upsertPrintfulVariantMapping(
  catalogSlug: string,
  printfulVariantId: string,
  productName: string,
  size: string,
  existing: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): PrintfulVariantMapping[] {
  const next: PrintfulVariantMapping = {
    catalogSlug,
    printfulVariantId: printfulVariantId.trim(),
    productName: productName.trim() || "Print",
    size: size.trim() || "Standard",
    updatedAt: new Date().toISOString(),
  };
  return mergePrintfulVariantMappings(
    existing.filter((item) => item.catalogSlug !== catalogSlug),
    [next],
  );
}
