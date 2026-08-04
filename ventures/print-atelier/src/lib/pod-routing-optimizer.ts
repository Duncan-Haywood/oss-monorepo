import { catalogArtworks, type CatalogArtwork } from "./marketplace";
import { getBaseFulfillmentQuote, type FulfillmentRegion } from "./fulfillment-cost-router";

export type FulfillmentPriority = "cheapest" | "fastest" | "margin_maximized";

export type PodFacility = {
  id: string;
  name: string;
  provider: "printful" | "gelato";
  countryCode: string;
  region: FulfillmentRegion;
  supportedDestinations: string[]; // ISO country codes
  tariffSurchargePct: number;
  qualityRating: number; // 1-5 scale
};

export const defaultPodFacilities: PodFacility[] = [
  {
    id: "pf-charlotte-us",
    name: "Printful Charlotte Hub",
    provider: "printful",
    countryCode: "US",
    region: "US",
    supportedDestinations: ["US", "CA", "MX"],
    tariffSurchargePct: 0.0,
    qualityRating: 4.9,
  },
  {
    id: "pf-riga-eu",
    name: "Printful Riga Hub",
    provider: "printful",
    countryCode: "LV",
    region: "EU",
    supportedDestinations: ["DE", "FR", "ES", "IT", "NL", "PL", "SE", "FI", "BE", "LV", "LT", "EE"],
    tariffSurchargePct: 0.0,
    qualityRating: 4.85,
  },
  {
    id: "pf-wolverhampton-uk",
    name: "Printful Wolverhampton Hub",
    provider: "printful",
    countryCode: "GB",
    region: "UK",
    supportedDestinations: ["GB", "IE"],
    tariffSurchargePct: 0.0,
    qualityRating: 4.8,
  },
  {
    id: "gel-frankfurt-eu",
    name: "Gelato Frankfurt Print Network",
    provider: "gelato",
    countryCode: "DE",
    region: "EU",
    supportedDestinations: ["DE", "FR", "ES", "IT", "NL", "PL", "SE", "FI", "BE", "AT", "CH", "DK", "NO"],
    tariffSurchargePct: 0.0,
    qualityRating: 4.92,
  },
  {
    id: "gel-tokyo-apac",
    name: "Gelato Tokyo Print Network",
    provider: "gelato",
    countryCode: "JP",
    region: "APAC",
    supportedDestinations: ["JP", "KR", "TW", "HK", "SG", "AU", "NZ"],
    tariffSurchargePct: 0.02,
    qualityRating: 4.88,
  },
  {
    id: "gel-sydney-apac",
    name: "Gelato Sydney Print Network",
    provider: "gelato",
    countryCode: "AU",
    region: "APAC",
    supportedDestinations: ["AU", "NZ"],
    tariffSurchargePct: 0.0,
    qualityRating: 4.9,
  },
];

export type MultiFacilityRoutingRequest = {
  catalogSlug: string;
  destinationCountryCode: string;
  destinationRegion?: FulfillmentRegion;
  quantity?: number;
  priority?: FulfillmentPriority;
  customRetailPriceUsd?: number;
};

export type FacilityRoutingOption = {
  facility: PodFacility;
  provider: "printful" | "gelato";
  basePrintCostUsd: number;
  shippingCostUsd: number;
  tariffEstimateUsd: number;
  totalFulfillmentCostUsd: number;
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
  artistPayoutUsd: number;
  platformProfitUsd: number;
  platformMarginPct: number;
};

export type MultiFacilityRoutingDecision = {
  catalogSlug: string;
  artworkTitle: string;
  destinationCountryCode: string;
  destinationRegion: FulfillmentRegion;
  priority: FulfillmentPriority;
  retailPriceUsd: number;
  selectedFacility: PodFacility;
  selectedOption: FacilityRoutingOption;
  alternativeOptions: FacilityRoutingOption[];
  isArtistPayoutProtected: boolean; // Must meet 30% net profit split
  costSavingsVsDefaultUsd: number;
  deliverySpeedGainDays: number;
  routingSummary: string;
  timestamp: string;
};

export function resolveRegionFromCountry(countryCode: string): FulfillmentRegion {
  const code = countryCode.toUpperCase();
  if (["US", "CA", "MX"].includes(code)) return "US";
  if (["GB", "UK", "IE"].includes(code)) return "UK";
  if (["DE", "FR", "ES", "IT", "NL", "PL", "SE", "FI", "BE", "AT", "CH", "DK", "NO", "LV", "LT", "EE"].includes(code)) return "EU";
  if (["JP", "KR", "TW", "HK", "SG", "AU", "NZ"].includes(code)) return "APAC";
  return "ROW";
}

export function calculateFacilityOption(
  facility: PodFacility,
  slug: string,
  region: FulfillmentRegion,
  retailPriceUsd: number,
  quantity: number,
): FacilityRoutingOption {
  const quote = getBaseFulfillmentQuote(facility.provider, slug, region, retailPriceUsd);
  const basePrintCost = (quote.basePrintCostUsd || (retailPriceUsd > 100 ? 25 : 17)) * quantity;
  const baseShippingCost = (quote.shippingCostUsd || 7.0) * Math.sqrt(quantity);
  const tariffEstimateUsd = Number((basePrintCost * facility.tariffSurchargePct).toFixed(2));

  const totalFulfillmentCostUsd = Number((basePrintCost + baseShippingCost + tariffEstimateUsd).toFixed(2));
  const grossProfitUsd = retailPriceUsd * quantity - totalFulfillmentCostUsd;
  const artistPayoutUsd = Number(Math.max(0, grossProfitUsd * 0.3).toFixed(2));
  const platformProfitUsd = Number((grossProfitUsd - artistPayoutUsd).toFixed(2));
  const platformMarginPct = retailPriceUsd > 0 ? Number(((platformProfitUsd / (retailPriceUsd * quantity)) * 100).toFixed(1)) : 0;

  return {
    facility,
    provider: facility.provider,
    basePrintCostUsd: basePrintCost,
    shippingCostUsd: baseShippingCost,
    tariffEstimateUsd,
    totalFulfillmentCostUsd,
    estimatedDeliveryDaysMin: quote.estimatedDeliveryDaysMin || 3,
    estimatedDeliveryDaysMax: quote.estimatedDeliveryDaysMax || 7,
    artistPayoutUsd,
    platformProfitUsd,
    platformMarginPct,
  };
}

export function optimizePodRouting(request: MultiFacilityRoutingRequest): MultiFacilityRoutingDecision {
  const foundArtwork = catalogArtworks.find((a) => a.slug === request.catalogSlug);
  const artworkTitle = foundArtwork
    ? foundArtwork.title
    : request.catalogSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  const retailPriceUsd = request.customRetailPriceUsd || foundArtwork?.retailPrice || 95.0;
  const quantity = Math.max(1, request.quantity || 1);
  const priority = request.priority || "margin_maximized";
  const region = request.destinationRegion || resolveRegionFromCountry(request.destinationCountryCode);

  const eligibleFacilities = defaultPodFacilities.filter(
    (f) => f.supportedDestinations.includes(request.destinationCountryCode.toUpperCase()) || f.region === region,
  );

  const facilitiesToScore = eligibleFacilities.length > 0 ? eligibleFacilities : defaultPodFacilities.slice(0, 2);

  const options: FacilityRoutingOption[] = facilitiesToScore.map((f) =>
    calculateFacilityOption(f, request.catalogSlug, region, retailPriceUsd, quantity),
  );

  // Sort options according to specified priority
  const sorted = [...options].sort((a, b) => {
    if (priority === "cheapest") {
      return a.totalFulfillmentCostUsd - b.totalFulfillmentCostUsd;
    } else if (priority === "fastest") {
      return a.estimatedDeliveryDaysMin - b.estimatedDeliveryDaysMin;
    } else {
      // margin_maximized (default)
      return b.platformProfitUsd - a.platformProfitUsd;
    }
  });

  const selectedOption = sorted[0];
  const defaultOption = options[0];

  const costSavingsUsd = Number(Math.max(0, defaultOption.totalFulfillmentCostUsd - selectedOption.totalFulfillmentCostUsd).toFixed(2));
  const deliverySpeedGainDays = Math.max(0, defaultOption.estimatedDeliveryDaysMin - selectedOption.estimatedDeliveryDaysMin);
  const isArtistPayoutProtected = selectedOption.artistPayoutUsd > 0;

  const routingSummary = `Routed order of '${artworkTitle}' to ${selectedOption.facility.name} (${selectedOption.provider.toUpperCase()}) in ${region}. Total fulfillment: $${selectedOption.totalFulfillmentCostUsd}, Artist 30% payout: $${selectedOption.artistPayoutUsd}, Platform profit: $${selectedOption.platformProfitUsd} (${selectedOption.platformMarginPct}% margin).`;

  return {
    catalogSlug: request.catalogSlug,
    artworkTitle: artworkTitle,
    destinationCountryCode: request.destinationCountryCode,
    destinationRegion: region,
    priority,
    retailPriceUsd,
    selectedFacility: selectedOption.facility,
    selectedOption,
    alternativeOptions: sorted.slice(1),
    isArtistPayoutProtected,
    costSavingsVsDefaultUsd: costSavingsUsd,
    deliverySpeedGainDays,
    routingSummary,
    timestamp: new Date().toISOString(),
  };
}
