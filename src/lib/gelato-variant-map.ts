import { catalogArtworks, type CatalogArtwork } from "./marketplace";

export type GelatoVariantMapping = {
  catalogSlug: string;
  gelatoProductUid: string;
  productName: string;
  size: string;
  updatedAt: string;
};

const STORAGE_KEY = "print-atelier-gelato-variant-map";

/** Seed mappings for EU/APAC routing — replace with Gelato dashboard product UIDs in production. */
export const defaultGelatoVariantMappings: GelatoVariantMapping[] = [
  {
    catalogSlug: "midnight-coast",
    gelatoProductUid: "gel_poster_18x24_matte",
    productName: "Premium Matte Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "urban-geometry",
    gelatoProductUid: "gel_poster_18x24_matte",
    productName: "Premium Matte Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "spring-bloom",
    gelatoProductUid: "gel_poster_12x16_matte",
    productName: "Premium Matte Poster (12×16)",
    size: "12×16 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "desert-sun",
    gelatoProductUid: "gel_poster_18x24_matte",
    productName: "Premium Matte Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
  {
    catalogSlug: "city-at-dusk",
    gelatoProductUid: "gel_poster_18x24_matte",
    productName: "Premium Matte Poster (18×24)",
    size: "18×24 in",
    updatedAt: "2026-06-12T00:00:00.000Z",
  },
];

export function serializeGelatoVariantMappings(mappings: GelatoVariantMapping[]): string {
  return JSON.stringify(mappings);
}

export function parseGelatoVariantMappings(raw: string | null): GelatoVariantMapping[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GelatoVariantMapping[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.catalogSlug === "string" &&
        typeof item.gelatoProductUid === "string" &&
        item.gelatoProductUid.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function loadGelatoVariantMappingsFromStorage(): GelatoVariantMapping[] {
  if (typeof window === "undefined") return [];
  const stored = parseGelatoVariantMappings(window.localStorage.getItem(STORAGE_KEY));
  return stored.length > 0 ? stored : defaultGelatoVariantMappings;
}

export function saveGelatoVariantMappingsToStorage(mappings: GelatoVariantMapping[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeGelatoVariantMappings(mappings));
}

export function mergeGelatoVariantMappings(
  base: GelatoVariantMapping[],
  overrides: GelatoVariantMapping[],
): GelatoVariantMapping[] {
  const bySlug = new Map(base.map((item) => [item.catalogSlug, item]));
  for (const override of overrides) {
    bySlug.set(override.catalogSlug, override);
  }
  return Array.from(bySlug.values()).sort((a, b) => a.catalogSlug.localeCompare(b.catalogSlug));
}

export function resolveGelatoProductUid(
  catalogSlug: string,
  mappings: GelatoVariantMapping[] = defaultGelatoVariantMappings,
): string | null {
  const match = mappings.find((item) => item.catalogSlug === catalogSlug);
  if (!match?.gelatoProductUid.trim()) {
    return null;
  }
  return match.gelatoProductUid.trim();
}

export type GelatoVariantMapRow = {
  artwork: CatalogArtwork;
  mapping: GelatoVariantMapping | null;
  mapped: boolean;
  blockers: string[];
};

export type GelatoVariantMapDashboard = {
  liveCatalogCount: number;
  mappedCount: number;
  unmappedCount: number;
  mappingCoveragePercent: number;
  euRoutingReady: boolean;
  blockers: string[];
  rows: GelatoVariantMapRow[];
};

export function buildGelatoVariantMapDashboard(
  artworks: CatalogArtwork[] = catalogArtworks,
  mappings: GelatoVariantMapping[] = defaultGelatoVariantMappings,
): GelatoVariantMapDashboard {
  const liveArtworks = artworks.filter((artwork) => artwork.status === "Live");
  const mappingBySlug = new Map(mappings.map((item) => [item.catalogSlug, item]));

  const rows: GelatoVariantMapRow[] = liveArtworks.map((artwork) => {
    const mapping = mappingBySlug.get(artwork.slug) ?? null;
    const blockers: string[] = [];
    if (!mapping) {
      blockers.push("No Gelato product UID mapped");
    } else if (!mapping.gelatoProductUid.trim()) {
      blockers.push("Product UID is empty");
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

  const blockers = rows
    .filter((row) => !row.mapped)
    .slice(0, 4)
    .map((row) => `${row.artwork.slug}: ${row.blockers.join(", ")}`);

  return {
    liveCatalogCount: liveArtworks.length,
    mappedCount,
    unmappedCount,
    mappingCoveragePercent,
    euRoutingReady: unmappedCount === 0 && liveArtworks.length > 0,
    blockers,
    rows,
  };
}

export function upsertGelatoVariantMapping(
  catalogSlug: string,
  gelatoProductUid: string,
  productName: string,
  size: string,
  existing: GelatoVariantMapping[] = defaultGelatoVariantMappings,
): GelatoVariantMapping[] {
  const next: GelatoVariantMapping = {
    catalogSlug,
    gelatoProductUid: gelatoProductUid.trim(),
    productName: productName.trim() || "Print",
    size: size.trim() || "Standard",
    updatedAt: new Date().toISOString(),
  };
  return mergeGelatoVariantMappings(
    existing.filter((item) => item.catalogSlug !== catalogSlug),
    [next],
  );
}
