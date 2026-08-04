import { catalogArtworks, type CatalogArtwork } from "./marketplace";
import {
  buildPrintfulVariantMapDashboard,
  defaultPrintfulVariantMappings,
  type PrintfulVariantMapping,
} from "./printful-variant-map";
import {
  buildGelatoVariantMapDashboard,
  defaultGelatoVariantMappings,
  type GelatoVariantMapping,
} from "./gelato-variant-map";

export type PartnerSkuSyncStatus = "healthy" | "degraded" | "critical";

export type PartnerSkuSyncHealthReport = {
  syncStatus: PartnerSkuSyncStatus;
  liveCatalogCount: number;
  printfulCoveragePercent: number;
  gelatoCoveragePercent: number;
  unmappedPrintfulSlugsCount: number;
  unmappedGelatoSlugsCount: number;
  missingBothPartnersCount: number;
  missingBothSlugs: string[];
  activePartnersReady: ("Printful" | "Gelato")[];
  blockers: string[];
  summaryLabel: string;
};

export function checkPartnerSkuSyncStatus(options?: {
  artworks?: CatalogArtwork[];
  printfulMappings?: PrintfulVariantMapping[];
  gelatoMappings?: GelatoVariantMapping[];
}): PartnerSkuSyncHealthReport {
  const artworks = options?.artworks ?? catalogArtworks;
  const printfulMappings = options?.printfulMappings ?? defaultPrintfulVariantMappings;
  const gelatoMappings = options?.gelatoMappings ?? defaultGelatoVariantMappings;

  const printfulDash = buildPrintfulVariantMapDashboard(artworks, printfulMappings);
  const gelatoDash = buildGelatoVariantMapDashboard(artworks, gelatoMappings);

  const liveArtworks = artworks.filter((artwork) => artwork.status === "Live");

  const printfulMappedSlugs = new Set(
    printfulDash.rows.filter((r) => r.mapped).map((r) => r.artwork.slug),
  );
  const gelatoMappedSlugs = new Set(
    gelatoDash.rows.filter((r) => r.mapped).map((r) => r.artwork.slug),
  );

  const missingBothSlugs = liveArtworks
    .map((a) => a.slug)
    .filter((slug) => !printfulMappedSlugs.has(slug) && !gelatoMappedSlugs.has(slug));

  const activePartnersReady: ("Printful" | "Gelato")[] = [];
  if (printfulDash.fulfillmentReady) activePartnersReady.push("Printful");
  if (gelatoDash.euRoutingReady) activePartnersReady.push("Gelato");

  const blockers: string[] = [];
  if (missingBothSlugs.length > 0) {
    blockers.push(`Catalog items missing both fulfillment partners: ${missingBothSlugs.join(", ")}`);
  }
  if (printfulDash.unmappedCount > 0) {
    blockers.push(`Printful missing ${printfulDash.unmappedCount} SKU mapping(s)`);
  }
  if (gelatoDash.unmappedCount > 0) {
    blockers.push(`Gelato missing ${gelatoDash.unmappedCount} SKU mapping(s)`);
  }

  let syncStatus: PartnerSkuSyncStatus = "healthy";
  if (missingBothSlugs.length > 0 || (printfulDash.mappingCoveragePercent < 50 && gelatoDash.mappingCoveragePercent < 50)) {
    syncStatus = "critical";
  } else if (printfulDash.unmappedCount > 0 || gelatoDash.unmappedCount > 0) {
    syncStatus = "degraded";
  }

  const summaryLabel =
    syncStatus === "healthy"
      ? `All ${liveArtworks.length} live SKUs fully mapped across Printful and Gelato`
      : syncStatus === "degraded"
      ? `Partner SKU sync degraded: Printful (${printfulDash.mappingCoveragePercent}%), Gelato (${gelatoDash.mappingCoveragePercent}%)`
      : `Critical SKU sync gap: ${missingBothSlugs.length} item(s) unmapped across all partners`;

  return {
    syncStatus,
    liveCatalogCount: liveArtworks.length,
    printfulCoveragePercent: printfulDash.mappingCoveragePercent,
    gelatoCoveragePercent: gelatoDash.mappingCoveragePercent,
    unmappedPrintfulSlugsCount: printfulDash.unmappedCount,
    unmappedGelatoSlugsCount: gelatoDash.unmappedCount,
    missingBothPartnersCount: missingBothSlugs.length,
    missingBothSlugs,
    activePartnersReady,
    blockers,
    summaryLabel,
  };
}
