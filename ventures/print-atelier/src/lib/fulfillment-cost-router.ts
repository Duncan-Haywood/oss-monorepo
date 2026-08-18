import {
  catalogArtworks,
  calculatePrintEconomics,
  roundCurrency,
  type CatalogArtwork,
} from "./marketplace";
import { resolvePrintfulVariantId, defaultPrintfulVariantMappings } from "./printful-variant-map";
import { resolveGelatoProductUid, defaultGelatoVariantMappings } from "./gelato-variant-map";

export type FulfillmentRegion = "US" | "EU" | "UK" | "APAC" | "ROW";

export type FulfillmentCostQuote = {
  provider: "printful" | "gelato";
  variantIdOrUid: string;
  basePrintCostUsd: number;
  shippingCostUsd: number;
  totalFulfillmentCostUsd: number;
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
  availableInRegion: boolean;
};

export type FulfillmentRoutingDecision = {
  catalogSlug: string;
  artworkTitle: string;
  destinationRegion: FulfillmentRegion;
  retailPriceUsd: number;
  artistPayoutUsd: number; // 30% net profit split guarantee
  selectedProvider: "printful" | "gelato";
  selectedVariantIdOrUid: string;
  printfulQuote: FulfillmentCostQuote;
  gelatoQuote: FulfillmentCostQuote;
  costSavingsUsd: number;
  platformProfitUsd: number;
  platformProfitMarginPct: number;
  isArtistPayoutGuaranteed: boolean;
  routingReason: string;
  timestamp: string;
};

export type FulfillmentRouterBatchReport = {
  decisions: FulfillmentRoutingDecision[];
  totalOrdersEvaluated: number;
  printfulSelectedCount: number;
  gelatoSelectedCount: number;
  totalFulfillmentSavingsUsd: number;
  averagePlatformProfitMarginPct: number;
  regionalBreakdown: Record<FulfillmentRegion, { count: number; preferredProvider: "printful" | "gelato" }>;
};

// Base cost models by size/medium (simplified benchmarks derived from partner APIs)
export function getBaseFulfillmentQuote(
  provider: "printful" | "gelato",
  catalogSlug: string,
  region: FulfillmentRegion,
  retailPriceUsd: number,
): FulfillmentCostQuote {
  const printfulId = resolvePrintfulVariantId(catalogSlug, defaultPrintfulVariantMappings);
  const gelatoUid = resolveGelatoProductUid(catalogSlug, defaultGelatoVariantMappings);

  if (provider === "printful") {
    if (!printfulId) {
      return {
        provider: "printful",
        variantIdOrUid: "",
        basePrintCostUsd: 0,
        shippingCostUsd: 0,
        totalFulfillmentCostUsd: 0,
        estimatedDeliveryDaysMin: 0,
        estimatedDeliveryDaysMax: 0,
        availableInRegion: false,
      };
    }
    // Printful base costs (stronger in US/UK, standard worldwide)
    const basePrintCostUsd = retailPriceUsd > 100 ? 28.5 : 18.0;
    let shippingCostUsd = 6.5;
    let minDays = 3;
    let maxDays = 5;

    if (region === "US") {
      shippingCostUsd = 5.99;
      minDays = 3;
      maxDays = 5;
    } else if (region === "EU") {
      shippingCostUsd = 8.5;
      minDays = 4;
      maxDays = 8;
    } else if (region === "UK") {
      shippingCostUsd = 6.0;
      minDays = 3;
      maxDays = 6;
    } else if (region === "APAC") {
      shippingCostUsd = 12.0;
      minDays = 6;
      maxDays = 12;
    } else {
      shippingCostUsd = 15.0;
      minDays = 8;
      maxDays = 15;
    }

    return {
      provider: "printful",
      variantIdOrUid: printfulId,
      basePrintCostUsd,
      shippingCostUsd,
      totalFulfillmentCostUsd: basePrintCostUsd + shippingCostUsd,
      estimatedDeliveryDaysMin: minDays,
      estimatedDeliveryDaysMax: maxDays,
      availableInRegion: true,
    };
  } else {
    if (!gelatoUid) {
      return {
        provider: "gelato",
        variantIdOrUid: "",
        basePrintCostUsd: 0,
        shippingCostUsd: 0,
        totalFulfillmentCostUsd: 0,
        estimatedDeliveryDaysMin: 0,
        estimatedDeliveryDaysMax: 0,
        availableInRegion: false,
      };
    }
    // Gelato local printing network (cheaper & faster in EU/APAC)
    const basePrintCostUsd = retailPriceUsd > 100 ? 26.0 : 16.5;
    let shippingCostUsd = 5.5;
    let minDays = 2;
    let maxDays = 4;

    if (region === "US") {
      shippingCostUsd = 6.5;
      minDays = 4;
      maxDays = 6;
    } else if (region === "EU") {
      shippingCostUsd = 4.99;
      minDays = 2;
      maxDays = 4;
    } else if (region === "UK") {
      shippingCostUsd = 5.5;
      minDays = 2;
      maxDays = 5;
    } else if (region === "APAC") {
      shippingCostUsd = 7.5;
      minDays = 3;
      maxDays = 7;
    } else {
      shippingCostUsd = 11.0;
      minDays = 5;
      maxDays = 10;
    }

    return {
      provider: "gelato",
      variantIdOrUid: gelatoUid,
      basePrintCostUsd,
      shippingCostUsd,
      totalFulfillmentCostUsd: basePrintCostUsd + shippingCostUsd,
      estimatedDeliveryDaysMin: minDays,
      estimatedDeliveryDaysMax: maxDays,
      availableInRegion: true,
    };
  }
}

export function optimizeFulfillmentRouting(
  catalogSlug: string,
  region: FulfillmentRegion,
  overrideRetailPriceUsd?: number,
  artworks: CatalogArtwork[] = catalogArtworks,
): FulfillmentRoutingDecision {
  const artwork = artworks.find((a) => a.slug === catalogSlug);
  const retailPriceUsd = overrideRetailPriceUsd ?? artwork?.retailPrice ?? 120;
  const artworkTitle = artwork?.title ?? catalogSlug;

  const printfulQuote = getBaseFulfillmentQuote("printful", catalogSlug, region, retailPriceUsd);
  const gelatoQuote = getBaseFulfillmentQuote("gelato", catalogSlug, region, retailPriceUsd);

  let selectedProvider: "printful" | "gelato" = "printful";
  let routingReason = "Printful default provider";

  if (!printfulQuote.availableInRegion && gelatoQuote.availableInRegion) {
    selectedProvider = "gelato";
    routingReason = "Printful unmapped; routed to Gelato";
  } else if (!gelatoQuote.availableInRegion && printfulQuote.availableInRegion) {
    selectedProvider = "printful";
    routingReason = "Gelato unmapped; routed to Printful";
  } else if (printfulQuote.availableInRegion && gelatoQuote.availableInRegion) {
    if (gelatoQuote.totalFulfillmentCostUsd < printfulQuote.totalFulfillmentCostUsd) {
      selectedProvider = "gelato";
      routingReason = `Gelato saves $${(
        printfulQuote.totalFulfillmentCostUsd - gelatoQuote.totalFulfillmentCostUsd
      ).toFixed(2)} in total fulfillment cost`;
    } else {
      selectedProvider = "printful";
      routingReason = `Printful saves $${(
        gelatoQuote.totalFulfillmentCostUsd - printfulQuote.totalFulfillmentCostUsd
      ).toFixed(2)} in total fulfillment cost`;
    }
  }

  const selectedQuote = selectedProvider === "printful" ? printfulQuote : gelatoQuote;
  const alternateQuote = selectedProvider === "printful" ? gelatoQuote : printfulQuote;

  const costSavingsUsd =
    alternateQuote.availableInRegion && selectedQuote.availableInRegion
      ? Math.max(0, Math.round((alternateQuote.totalFulfillmentCostUsd - selectedQuote.totalFulfillmentCostUsd) * 100) / 100)
      : 0;

  // The artist's 30% is a share of NET PROFIT, not of retail. Retail still
  // contains the payment fee, the POD fulfillment cost and the AI compute cost,
  // so 30% of retail is materially larger: on a $120 print, which routes to
  // Gelato in the US, it is $36.00 against a true share of $25.06 — a ~44%
  // overstatement of
  // what the artist is owed, and the same dollars understated as platform margin.
  //
  // This is derived from `calculatePrintEconomics`, the one engine that owns this
  // split, rather than re-typing `* 0.3` here on a different basis. The two had
  // already drifted apart while both looked correct; see the artist payout pins
  // in scripts/ci/cap_ratchet.py, which name this exact divergence.
  //
  // The fulfillment cost used is the SELECTED provider's, so the payout tracks
  // the routing decision this function actually makes.
  const economics = calculatePrintEconomics({
    retailPrice: retailPriceUsd,
    fulfillmentCost: selectedQuote.totalFulfillmentCostUsd,
  });

  // A loss-making order owes the artist nothing; it does not claw back from them.
  // The loss stays with the platform below, and `isArtistPayoutGuaranteed`
  // reports it. Mirrors the clamp `simulateStripeConnectPayout` already applies.
  const artistPayoutUsd = Math.max(0, economics.artistShare);

  // Net profit splits into exactly these two parts, so whatever the clamp above
  // withholds from the artist is borne here rather than vanishing from the
  // record. Where net profit is positive this equals `economics.platformShare`.
  const platformProfitUsd = roundCurrency(economics.netProfit - artistPayoutUsd);
  const platformProfitMarginPct =
    retailPriceUsd > 0 ? Math.round((platformProfitUsd / retailPriceUsd) * 1000) / 10 : 0;

  const isArtistPayoutGuaranteed = platformProfitUsd >= 0;

  return {
    catalogSlug,
    artworkTitle,
    destinationRegion: region,
    retailPriceUsd,
    artistPayoutUsd,
    selectedProvider,
    selectedVariantIdOrUid: selectedQuote.variantIdOrUid,
    printfulQuote,
    gelatoQuote,
    costSavingsUsd,
    platformProfitUsd,
    platformProfitMarginPct,
    isArtistPayoutGuaranteed,
    routingReason,
    timestamp: new Date().toISOString(),
  };
}

export function evaluateFulfillmentRoutingBatch(
  slugs: string[],
  regions: FulfillmentRegion[] = ["US", "EU", "UK", "APAC", "ROW"],
  artworks: CatalogArtwork[] = catalogArtworks,
): FulfillmentRouterBatchReport {
  const decisions: FulfillmentRoutingDecision[] = [];

  for (const slug of slugs) {
    for (const region of regions) {
      decisions.push(optimizeFulfillmentRouting(slug, region, undefined, artworks));
    }
  }

  const totalOrdersEvaluated = decisions.length;
  const printfulSelectedCount = decisions.filter((d) => d.selectedProvider === "printful").length;
  const gelatoSelectedCount = decisions.filter((d) => d.selectedProvider === "gelato").length;
  const totalFulfillmentSavingsUsd =
    Math.round(decisions.reduce((sum, d) => sum + d.costSavingsUsd, 0) * 100) / 100;

  const avgProfitMarginPct =
    totalOrdersEvaluated > 0
      ? Math.round(
          (decisions.reduce((sum, d) => sum + d.platformProfitMarginPct, 0) / totalOrdersEvaluated) * 10,
        ) / 10
      : 0;

  const regionalBreakdown: Record<
    FulfillmentRegion,
    { count: number; preferredProvider: "printful" | "gelato" }
  > = {
    US: { count: 0, preferredProvider: "printful" },
    EU: { count: 0, preferredProvider: "gelato" },
    UK: { count: 0, preferredProvider: "printful" },
    APAC: { count: 0, preferredProvider: "gelato" },
    ROW: { count: 0, preferredProvider: "printful" },
  };

  for (const reg of ["US", "EU", "UK", "APAC", "ROW"] as FulfillmentRegion[]) {
    const regDecisions = decisions.filter((d) => d.destinationRegion === reg);
    const pCount = regDecisions.filter((d) => d.selectedProvider === "printful").length;
    const gCount = regDecisions.filter((d) => d.selectedProvider === "gelato").length;
    regionalBreakdown[reg] = {
      count: regDecisions.length,
      preferredProvider: gCount >= pCount ? "gelato" : "printful",
    };
  }

  return {
    decisions,
    totalOrdersEvaluated,
    printfulSelectedCount,
    gelatoSelectedCount,
    totalFulfillmentSavingsUsd,
    averagePlatformProfitMarginPct: avgProfitMarginPct,
    regionalBreakdown,
  };
}

export type ConvexFulfillmentRouteRecord = {
  routeId: string;
  catalogSlug: string;
  destinationRegion: string;
  retailPriceUsd: number;
  artistPayoutUsd: number;
  selectedProvider: string;
  costSavingsUsd: number;
  platformProfitUsd: number;
  isArtistPayoutGuaranteed: boolean;
  routingReason: string;
  timestamp: string;
  convexSyncedAt: string;
};

const fulfillmentRouteStore: ConvexFulfillmentRouteRecord[] = [];

export function generateConvexFulfillmentRouterSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  fulfillment_routing_records: defineTable({
    routeId: v.string(),
    catalogSlug: v.string(),
    destinationRegion: v.string(),
    retailPriceUsd: v.number(),
    artistPayoutUsd: v.number(),
    selectedProvider: v.string(),
    costSavingsUsd: v.number(),
    platformProfitUsd: v.number(),
    isArtistPayoutGuaranteed: v.boolean(),
    routingReason: v.string(),
    timestamp: v.string(),
    convexSyncedAt: v.string(),
  })
    .index("by_routeId", ["routeId"])
    .index("by_slug_region", ["catalogSlug", "destinationRegion"]),
});
`;
  return {
    tableName: "fulfillment_routing_records",
    indexes: ["by_routeId", "by_slug_region"],
    schemaCode: schemaCode.trim(),
  };
}

export function persistFulfillmentRoutingDecision(
  decision: FulfillmentRoutingDecision,
  timestamp: string = new Date().toISOString(),
): ConvexFulfillmentRouteRecord {
  const routeId = `froute_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: ConvexFulfillmentRouteRecord = {
    routeId,
    catalogSlug: decision.catalogSlug,
    destinationRegion: decision.destinationRegion,
    retailPriceUsd: decision.retailPriceUsd,
    artistPayoutUsd: decision.artistPayoutUsd,
    selectedProvider: decision.selectedProvider,
    costSavingsUsd: decision.costSavingsUsd,
    platformProfitUsd: decision.platformProfitUsd,
    isArtistPayoutGuaranteed: decision.isArtistPayoutGuaranteed,
    routingReason: decision.routingReason,
    timestamp: decision.timestamp,
    convexSyncedAt: timestamp,
  };

  fulfillmentRouteStore.unshift(record);
  return record;
}

export function getFulfillmentRouteRecords(limit?: number): ConvexFulfillmentRouteRecord[] {
  let records = [...fulfillmentRouteStore];
  if (limit) records = records.slice(0, limit);
  return records;
}

export function clearFulfillmentRouteStoreForTesting(): void {
  fulfillmentRouteStore.length = 0;
}
