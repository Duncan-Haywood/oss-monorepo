export type ArtworkStatus = "Live" | "Proof pending" | "Processing";

export type CatalogArtwork = {
  id: number;
  slug: string;
  title: string;
  artistName: string;
  artistInitials: string;
  style: "Abstract" | "Landscape" | "Portrait" | "Minimal";
  status: ArtworkStatus;
  retailPrice: number;
  fulfillmentCost: number;
  imageClass: string;
  tags: string[];
  hasSeoCopy: boolean;
  hasRoomMockups: boolean;
  hasApprovedProof: boolean;
  salesLast30Days: number;
  projectedMonthlyArtistPayout: number;
  badge?: string;
  readinessScore?: number;
};

export type PrintEconomicsInput = {
  retailPrice: number;
  fulfillmentCost: number;
  paymentFeeRate?: number;
  aiComputeCost?: number;
};

export type ChannelScenarioInput = PrintEconomicsInput & {
  monthlyOrders: number;
  customerAcquisitionCost: number;
  purchasesPerCustomer: number;
};

export type ArtistPayoutComparisonInput = PrintEconomicsInput & {
  monthlyOrders: number;
};

export type ArtistPayoutModelComparison = {
  id: string;
  label: string;
  basis: string;
  artistPayoutPerOrder: number;
  monthlyArtistPayout: number;
  operatorBurden: "Low" | "Medium" | "High";
  sourceNote: string;
  isPodAlternative: boolean;
};

export type PayoutExceptionSeverity = "critical" | "review";

export type PayoutExceptionQueueOptions = {
  monthlyOrders?: number;
  minimumArtistPayoutPerOrder?: number;
  targetPodAdvantagePerOrder?: number;
  maxSuggestedRetailPrice?: number;
  paymentFeeRate?: number;
  aiComputeCost?: number;
};

export type PayoutExceptionQueueItem = {
  artwork: CatalogArtwork;
  severity: PayoutExceptionSeverity;
  currentArtistPayoutPerOrder: number;
  bestPodAlternativeLabel: string;
  podAdvantagePerOrder: number;
  suggestedRetailPrice: number;
  blockers: string[];
  nextAction: string;
  holdMessage: string;
};

export type ListingReleaseStatus = "release-ready" | "override-review" | "hold";

export type ListingReleaseOwner = "Growth" | "Finance" | "Ops";

export type ListingReleaseDecision = {
  artwork: CatalogArtwork;
  releaseStatus: ListingReleaseStatus;
  owner: ListingReleaseOwner;
  canUsePayoutPromise: boolean;
  currentArtistPayoutPerOrder: number;
  bestPodAlternativeLabel: string;
  podAdvantagePerOrder: number;
  suggestedRetailPrice: number;
  blockers: string[];
  overrideReasons: string[];
  artistFacingCopy: string;
  operatorAction: string;
};

export type ListingReleaseDecisionQueue = {
  decisions: ListingReleaseDecision[];
  releaseReadyCount: number;
  holdCount: number;
  overrideReviewCount: number;
};

export type ListingConsentRecord = {
  artworkSlug: string;
  podLicenseAccepted: boolean;
  paidAdRightsAccepted: boolean;
  aiRoomSceneAccepted: boolean;
  payoutAcknowledged: boolean;
};

export type ListingConsentStatus = "cleared" | "missing-consent" | "release-blocked";

export type ListingConsentGateItem = {
  artwork: CatalogArtwork;
  consentStatus: ListingConsentStatus;
  owner: ListingReleaseOwner | "Legal";
  missingConsents: string[];
  allowedChannels: string[];
  operatorAction: string;
  releaseStatus: ListingReleaseStatus;
};

export type ListingConsentGateQueue = {
  items: ListingConsentGateItem[];
  clearedCount: number;
  blockedCount: number;
  missingConsentCount: number;
};

export type BudgetChannelInput = {
  id: string;
  label: string;
  weeklyBudgetCap: number;
  baselineCAC: number;
  purchasesPerCustomer: number;
  previewLiftPercent: number;
};

export type WeeklyChannelBudgetInput = PrintEconomicsInput & {
  totalWeeklyBudget: number;
  minLtvToCacRatio: number;
  channels: BudgetChannelInput[];
};

export type ChannelBudgetAllocation = {
  id: string;
  label: string;
  weeklyBudgetCap: number;
  baselineCAC: number;
  adjustedCAC: number;
  previewLiftPercent: number;
  purchasesPerCustomer: number;
  ltvToCacRatio: number;
  profitAfterCAC: number;
  score: number;
  eligible: boolean;
  blockers: string[];
  recommendedWeeklyBudget: number;
};

export type CreativeChannel = "paid-social" | "search" | "artist-referral";

export type CreativeReadinessOptions = {
  baselineCAC?: number;
};

export type RoomPreviewExperimentInput = {
  monthlyVisitors: number;
  baselineConversionRate: number;
  baselineCAC: number;
  previewEngagementRate: number;
  conversionLiftPercent: number;
  purchasesPerCustomer: number;
};

export type CreativeSimilarityRisk = "Low" | "Moderate" | "High";

export type AdCreativeConcept = {
  format: string;
  hook: string;
  message: string;
};

export const catalogArtworks: CatalogArtwork[] = [
  {
    id: 1,
    slug: "midnight-coast",
    title: "Midnight Coast",
    artistName: "Elena Rostova",
    artistInitials: "ER",
    style: "Landscape",
    status: "Live",
    retailPrice: 85,
    fulfillmentCost: 28,
    imageClass: "bg-gradient-to-br from-blue-950 to-indigo-800",
    tags: ["coastal", "night", "blue", "moody"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 42,
    projectedMonthlyArtistPayout: 681.66,
    badge: "Bestseller",
    readinessScore: 100,
  },
  {
    id: 2,
    slug: "urban-geometry",
    title: "Urban Geometry",
    artistName: "Marcus Chen",
    artistInitials: "MC",
    style: "Abstract",
    status: "Live",
    retailPrice: 110,
    fulfillmentCost: 36,
    imageClass: "bg-gradient-to-br from-gray-800 to-gray-600",
    tags: ["urban", "geometry", "monochrome"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 18,
    projectedMonthlyArtistPayout: 379.98,
    badge: "New",
    readinessScore: 92,
  },
  {
    id: 3,
    slug: "spring-bloom",
    title: "Spring Bloom",
    artistName: "Sarah Jenkins",
    artistInitials: "SJ",
    style: "Portrait",
    status: "Live",
    retailPrice: 65,
    fulfillmentCost: 18,
    imageClass: "bg-gradient-to-br from-emerald-800 to-green-600",
    tags: ["botanical", "green", "spring"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 22,
    projectedMonthlyArtistPayout: 295.02,
    readinessScore: 88,
  },
  {
    id: 4,
    slug: "desert-sun",
    title: "Desert Sun",
    artistName: "Elena Rostova",
    artistInitials: "ER",
    style: "Landscape",
    status: "Live",
    retailPrice: 95,
    fulfillmentCost: 32,
    imageClass: "bg-gradient-to-br from-orange-900 to-amber-700",
    tags: ["desert", "warm", "sunset"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 6,
    projectedMonthlyArtistPayout: 107.34,
    readinessScore: 88,
  },
  {
    id: 5,
    slug: "city-at-dusk",
    title: "City at Dusk",
    artistName: "Marcus Chen",
    artistInitials: "MC",
    style: "Minimal",
    status: "Live",
    retailPrice: 105,
    fulfillmentCost: 34,
    imageClass: "bg-gradient-to-br from-rose-900 to-purple-900",
    tags: ["city", "dusk", "minimal"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 5,
    projectedMonthlyArtistPayout: 95.43,
    badge: "Trending",
    readinessScore: 90,
  },
  {
    id: 6,
    slug: "abstract-no-4",
    title: "Abstract No. 4",
    artistName: "Alex Jenkins",
    artistInitials: "AJ",
    style: "Abstract",
    status: "Proof pending",
    retailPrice: 55,
    fulfillmentCost: 40,
    imageClass: "bg-gradient-to-br from-purple-950 to-violet-700",
    tags: ["abstract", "purple"],
    hasSeoCopy: true,
    hasRoomMockups: false,
    hasApprovedProof: false,
    salesLast30Days: 0,
    projectedMonthlyArtistPayout: 0,
    readinessScore: 40,
  },
];

export function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function calculatePrintEconomics({
  retailPrice,
  fulfillmentCost,
  paymentFeeRate = 0.03,
  aiComputeCost = 0.35,
}: PrintEconomicsInput) {
  const paymentFee = roundCurrency(retailPrice * paymentFeeRate);
  const netProfit = roundCurrency(retailPrice - paymentFee - fulfillmentCost - aiComputeCost);
  const artistShare = roundCurrency(netProfit * 0.3);
  const platformShare = roundCurrency(netProfit * 0.7);
  const marginPercent = retailPrice > 0 ? roundCurrency((netProfit / retailPrice) * 100) : 0;

  return {
    paymentFee,
    netProfit,
    artistShare,
    platformShare,
    marginPercent,
  };
}

export function compareArtistPayoutModels({
  retailPrice,
  fulfillmentCost,
  paymentFeeRate,
  aiComputeCost,
  monthlyOrders,
}: ArtistPayoutComparisonInput) {
  const economics = calculatePrintEconomics({
    retailPrice,
    fulfillmentCost,
    paymentFeeRate,
    aiComputeCost,
  });
  const safeMonthlyOrders = Math.max(monthlyOrders, 0);
  const toModel = (
    id: string,
    label: string,
    basis: string,
    artistPayoutPerOrder: number,
    operatorBurden: ArtistPayoutModelComparison["operatorBurden"],
    sourceNote: string,
    isPodAlternative = true,
  ): ArtistPayoutModelComparison => ({
    id,
    label,
    basis,
    artistPayoutPerOrder: roundCurrency(Math.max(artistPayoutPerOrder, 0)),
    monthlyArtistPayout: roundCurrency(Math.max(artistPayoutPerOrder, 0) * safeMonthlyOrders),
    operatorBurden,
    sourceNote,
    isPodAlternative,
  });

  const printAtelier = toModel(
    "print-atelier",
    "Print Atelier",
    "30% of net profit after POD, payment, and AI costs",
    economics.artistShare,
    "Low",
    "Internal marketplace promise",
    false,
  );
  const models = [
    toModel(
      "society6-wall-art",
      "Society6 wall art",
      "10% fixed wall-art royalty",
      retailPrice * 0.1,
      "Low",
      "Society6 March 2025 artist earnings update",
    ),
    toModel(
      "redbubble-standard",
      "Redbubble Standard",
      "20% markup less 50% account fee",
      retailPrice * 0.2 * 0.5,
      "Low",
      "Redbubble tiered fee benchmark",
    ),
    toModel(
      "redbubble-premium",
      "Redbubble Premium",
      "20% markup less 20% account fee",
      retailPrice * 0.2 * 0.8,
      "Low",
      "Redbubble premium-tier benchmark",
    ),
    toModel(
      "artfinder-original",
      "Artfinder original sale",
      "60% after 40% marketplace commission, before artist fulfillment labor",
      retailPrice * 0.6,
      "High",
      "Original-art marketplace benchmark; not a POD equivalent",
      false,
    ),
  ];
  const podModels = models.filter((model) => model.isPodAlternative);
  const bestPodAlternative = podModels.sort((a, b) => b.artistPayoutPerOrder - a.artistPayoutPerOrder)[0];
  const podAdvantagePerOrder = roundCurrency(
    printAtelier.artistPayoutPerOrder - (bestPodAlternative?.artistPayoutPerOrder ?? 0),
  );
  const blockers =
    podAdvantagePerOrder > 0
      ? []
      : ["Raise price or reduce POD cost before promising payout advantage"];

  return {
    printAtelier,
    models,
    bestPodAlternative,
    podAdvantagePerOrder,
    blockers,
    recommendation: blockers.length === 0 ? "Lead with transparent payout proof" : "Fix economics before outreach",
  };
}

function findSuggestedRetailPrice(
  artwork: CatalogArtwork,
  {
    monthlyOrders,
    minimumArtistPayoutPerOrder,
    targetPodAdvantagePerOrder,
    maxSuggestedRetailPrice,
    paymentFeeRate,
    aiComputeCost,
  }: Required<PayoutExceptionQueueOptions>,
) {
  for (let price = Math.ceil(artwork.retailPrice); price <= maxSuggestedRetailPrice; price += 1) {
    const comparison = compareArtistPayoutModels({
      retailPrice: price,
      fulfillmentCost: artwork.fulfillmentCost,
      monthlyOrders,
      paymentFeeRate,
      aiComputeCost,
    });

    if (
      comparison.printAtelier.artistPayoutPerOrder >= minimumArtistPayoutPerOrder &&
      comparison.podAdvantagePerOrder >= targetPodAdvantagePerOrder
    ) {
      return price;
    }
  }

  return maxSuggestedRetailPrice;
}

export function buildPayoutExceptionQueue(
  artworks: CatalogArtwork[],
  {
    monthlyOrders = 12,
    minimumArtistPayoutPerOrder = 8,
    targetPodAdvantagePerOrder = 0,
    maxSuggestedRetailPrice = 250,
    paymentFeeRate = 0.03,
    aiComputeCost = 0.35,
  }: PayoutExceptionQueueOptions = {},
): PayoutExceptionQueueItem[] {
  return artworks
    .map((artwork) => {
      const comparison = compareArtistPayoutModels({
        retailPrice: artwork.retailPrice,
        fulfillmentCost: artwork.fulfillmentCost,
        monthlyOrders,
        paymentFeeRate,
        aiComputeCost,
      });
      const blockers: string[] = [];
      const bestPodLabel = comparison.bestPodAlternative?.label ?? "best POD benchmark";

      if (comparison.podAdvantagePerOrder < 0) {
        blockers.push(`Trails ${bestPodLabel} by $${Math.abs(comparison.podAdvantagePerOrder).toFixed(2)}/order`);
      } else if (comparison.podAdvantagePerOrder < targetPodAdvantagePerOrder) {
        blockers.push(`Payout advantage below $${targetPodAdvantagePerOrder.toFixed(2)}/order target`);
      }
      if (comparison.printAtelier.artistPayoutPerOrder < minimumArtistPayoutPerOrder) {
        blockers.push(`Artist payout below $${minimumArtistPayoutPerOrder.toFixed(2)}/order floor`);
      }
      if (!artwork.hasApprovedProof || artwork.status !== "Live") {
        blockers.push("Proof is not approved");
      }
      if (!artwork.hasRoomMockups) {
        blockers.push("Room mockups missing");
      }

      if (blockers.length === 0) {
        return null;
      }

      const suggestedRetailPrice = findSuggestedRetailPrice(artwork, {
        monthlyOrders,
        minimumArtistPayoutPerOrder,
        targetPodAdvantagePerOrder,
        maxSuggestedRetailPrice,
        paymentFeeRate,
        aiComputeCost,
      });
      const severity: PayoutExceptionSeverity =
        comparison.podAdvantagePerOrder < 0 ||
        comparison.printAtelier.artistPayoutPerOrder < minimumArtistPayoutPerOrder ||
        !artwork.hasApprovedProof ||
        artwork.status !== "Live" ||
        !artwork.hasRoomMockups
          ? "critical"
          : "review";
      const priceAction =
        suggestedRetailPrice > artwork.retailPrice
          ? `Raise retail price to $${suggestedRetailPrice} or reduce POD cost before outreach`
          : "Keep price, but review payout proof before outreach";
      const proofAction = [
        !artwork.hasApprovedProof || artwork.status !== "Live" ? "approve proof" : null,
        !artwork.hasRoomMockups ? "generate room mockups" : null,
      ]
        .filter(Boolean)
        .join(" and ");

      return {
        artwork,
        severity,
        currentArtistPayoutPerOrder: comparison.printAtelier.artistPayoutPerOrder,
        bestPodAlternativeLabel: bestPodLabel,
        podAdvantagePerOrder: comparison.podAdvantagePerOrder,
        suggestedRetailPrice,
        blockers,
        nextAction: proofAction ? `${priceAction}; then ${proofAction}.` : `${priceAction}.`,
        holdMessage:
          severity === "critical"
            ? `Do not use the 30% payout promise for ${artwork.title} until economics, proof, and mockups clear guardrails.`
            : `Hold ${artwork.title} until payout advantage reaches $${targetPodAdvantagePerOrder.toFixed(2)}/order target.`,
      };
    })
    .filter((item): item is PayoutExceptionQueueItem => item !== null)
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }

      return a.podAdvantagePerOrder - b.podAdvantagePerOrder;
    });
}

export function buildListingReleaseDecisions(
  artworks: CatalogArtwork[],
  options: PayoutExceptionQueueOptions = {},
): ListingReleaseDecisionQueue {
  const resolvedOptions = {
    monthlyOrders: options.monthlyOrders ?? 12,
    minimumArtistPayoutPerOrder: options.minimumArtistPayoutPerOrder ?? 8,
    targetPodAdvantagePerOrder: options.targetPodAdvantagePerOrder ?? 0,
    maxSuggestedRetailPrice: options.maxSuggestedRetailPrice ?? 250,
    paymentFeeRate: options.paymentFeeRate ?? 0.03,
    aiComputeCost: options.aiComputeCost ?? 0.35,
  };
  const exceptionBySlug = new Map(
    buildPayoutExceptionQueue(artworks, resolvedOptions).map((item) => [item.artwork.slug, item]),
  );
  const statusRank: Record<ListingReleaseStatus, number> = {
    hold: 0,
    "override-review": 1,
    "release-ready": 2,
  };
  const decisions = artworks
    .map((artwork) => {
      const exception = exceptionBySlug.get(artwork.slug);
      const comparison = compareArtistPayoutModels({
        retailPrice: artwork.retailPrice,
        fulfillmentCost: artwork.fulfillmentCost,
        monthlyOrders: resolvedOptions.monthlyOrders,
        paymentFeeRate: resolvedOptions.paymentFeeRate,
        aiComputeCost: resolvedOptions.aiComputeCost,
      });
      const releaseStatus: ListingReleaseStatus = exception
        ? exception.severity === "review"
          ? "override-review"
          : "hold"
        : "release-ready";
      const canUsePayoutPromise = releaseStatus === "release-ready";
      const bestPodAlternativeLabel = comparison.bestPodAlternative?.label ?? "best POD benchmark";
      const podAdvantagePhrase =
        comparison.podAdvantagePerOrder >= 0
          ? `beats ${bestPodAlternativeLabel} by $${comparison.podAdvantagePerOrder.toFixed(2)}/print`
          : `trails ${bestPodAlternativeLabel} by $${Math.abs(comparison.podAdvantagePerOrder).toFixed(2)}/print`;

      return {
        artwork,
        releaseStatus,
        owner: releaseStatus === "release-ready" ? "Growth" : releaseStatus === "override-review" ? "Finance" : "Ops",
        canUsePayoutPromise,
        currentArtistPayoutPerOrder: comparison.printAtelier.artistPayoutPerOrder,
        bestPodAlternativeLabel,
        podAdvantagePerOrder: comparison.podAdvantagePerOrder,
        suggestedRetailPrice: exception?.suggestedRetailPrice ?? artwork.retailPrice,
        blockers: exception?.blockers ?? [],
        overrideReasons:
          releaseStatus === "override-review"
            ? ["Finance may approve lower POD advantage for strategic artist or cohort test"]
            : [],
        artistFacingCopy: canUsePayoutPromise
          ? `${artwork.artistName} keeps copyright, grants a limited POD/marketing license, and earns $${comparison.printAtelier.artistPayoutPerOrder.toFixed(2)}/print; Print Atelier ${podAdvantagePhrase} at today's costs.`
          : `Artist-facing payout copy is withheld for ${artwork.title}. Resolve guardrail blockers before showing earnings, rights, or ad-use language.`,
        operatorAction:
          releaseStatus === "release-ready"
            ? "Release to outreach with transparent payout proof and rights acknowledgement."
            : (exception?.nextAction ?? "Review payout proof before release."),
      } satisfies ListingReleaseDecision;
    })
    .sort(
      (a, b) =>
        statusRank[a.releaseStatus] - statusRank[b.releaseStatus] ||
        a.podAdvantagePerOrder - b.podAdvantagePerOrder,
    );

  return {
    decisions,
    releaseReadyCount: decisions.filter((decision) => decision.releaseStatus === "release-ready").length,
    holdCount: decisions.filter((decision) => decision.releaseStatus === "hold").length,
    overrideReviewCount: decisions.filter((decision) => decision.releaseStatus === "override-review").length,
  };
}

export function buildListingConsentGate(
  artworks: CatalogArtwork[],
  consentRecords: ListingConsentRecord[] = [],
  options: PayoutExceptionQueueOptions = {},
): ListingConsentGateQueue {
  const consentBySlug = new Map(consentRecords.map((record) => [record.artworkSlug, record]));
  const releaseBySlug = new Map(
    buildListingReleaseDecisions(artworks, options).decisions.map((decision) => [decision.artwork.slug, decision]),
  );
  const consentRequirements = [
    ["podLicenseAccepted", "POD license"] as const,
    ["paidAdRightsAccepted", "Paid advertising rights"] as const,
    ["aiRoomSceneAccepted", "AI room-scene use"] as const,
    ["payoutAcknowledged", "Payout acknowledgement"] as const,
  ];
  const channelRequirements = [
    ["storefront", "podLicenseAccepted"] as const,
    ["artist-outreach", "payoutAcknowledged"] as const,
    ["paid-ads", "paidAdRightsAccepted"] as const,
    ["ai-room-preview", "aiRoomSceneAccepted"] as const,
  ];
  const items = artworks.map((artwork) => {
    const releaseDecision = releaseBySlug.get(artwork.slug);
    const releaseStatus = releaseDecision?.releaseStatus ?? "hold";

    if (releaseStatus !== "release-ready") {
      return {
        artwork,
        consentStatus: "release-blocked",
        owner: releaseDecision?.owner ?? "Ops",
        missingConsents: [],
        allowedChannels: [],
        operatorAction: "Resolve release hold before collecting consent or exposing artist rights language.",
        releaseStatus,
      } satisfies ListingConsentGateItem;
    }

    const record = consentBySlug.get(artwork.slug);
    const missingConsents = consentRequirements
      .filter(([field]) => !record?.[field])
      .map(([, label]) => label);
    const allowedChannels = channelRequirements
      .filter(([, field]) => Boolean(record?.[field]))
      .map(([channel]) => channel);
    const consentStatus: ListingConsentStatus = missingConsents.length === 0 ? "cleared" : "missing-consent";
    const missingConsentCopy = missingConsents
      .map((label) => (label === "AI room-scene use" ? label : label.charAt(0).toLowerCase() + label.slice(1)))
      .join(" and ");
    const operatorAction =
      consentStatus === "cleared"
        ? "Release to storefront, artist outreach, paid ads, and AI room-preview demand."
        : `Collect ${missingConsentCopy} before using this listing in blocked channels.`;

    return {
      artwork,
      consentStatus,
      owner: consentStatus === "cleared" ? "Growth" : "Legal",
      missingConsents,
      allowedChannels,
      operatorAction,
      releaseStatus,
    } satisfies ListingConsentGateItem;
  });

  return {
    items,
    clearedCount: items.filter((item) => item.consentStatus === "cleared").length,
    blockedCount: items.filter((item) => item.consentStatus !== "cleared").length,
    missingConsentCount: items.filter((item) => item.consentStatus === "missing-consent").length,
  };
}

export function calculateChannelScenario({
  retailPrice,
  fulfillmentCost,
  paymentFeeRate,
  aiComputeCost,
  monthlyOrders,
  customerAcquisitionCost,
  purchasesPerCustomer,
}: ChannelScenarioInput) {
  const economics = calculatePrintEconomics({
    retailPrice,
    fulfillmentCost,
    paymentFeeRate,
    aiComputeCost,
  });
  const safePurchasesPerCustomer = Math.max(purchasesPerCustomer, 0.01);
  const monthlyNewCustomers = monthlyOrders / safePurchasesPerCustomer;
  const monthlyMarketingSpend = roundCurrency(monthlyNewCustomers * customerAcquisitionCost);
  const monthlyPlatformGross = roundCurrency(monthlyOrders * economics.platformShare);
  const monthlyArtistPayout = roundCurrency(monthlyOrders * economics.artistShare);
  const lifetimePlatformGross = roundCurrency(economics.platformShare * safePurchasesPerCustomer);
  const profitAfterCAC = roundCurrency(lifetimePlatformGross - customerAcquisitionCost);
  const ltvToCacRatio =
    customerAcquisitionCost > 0 ? roundCurrency(lifetimePlatformGross / customerAcquisitionCost) : 0;

  return {
    platformGrossPerOrder: economics.platformShare,
    artistPayoutPerOrder: economics.artistShare,
    lifetimePlatformGross,
    profitAfterCAC,
    paybackOrders:
      economics.platformShare > 0
        ? Math.ceil(customerAcquisitionCost / economics.platformShare)
        : Number.POSITIVE_INFINITY,
    ltvToCacRatio,
    monthlyMarketingSpend,
    monthlyPlatformGross,
    monthlyArtistPayout,
    monthlyContributionAfterCAC: roundCurrency(monthlyPlatformGross - monthlyMarketingSpend),
  };
}

export function allocateWeeklyChannelBudget({
  retailPrice,
  fulfillmentCost,
  paymentFeeRate,
  aiComputeCost,
  totalWeeklyBudget,
  minLtvToCacRatio,
  channels,
}: WeeklyChannelBudgetInput) {
  const allocations: ChannelBudgetAllocation[] = channels.map((channel) => {
    const previewLift = Math.max(channel.previewLiftPercent, 0);
    const adjustedCAC = roundCurrency(channel.baselineCAC * (1 - Math.min(previewLift, 100) / 100));
    const scenario = calculateChannelScenario({
      retailPrice,
      fulfillmentCost,
      paymentFeeRate,
      aiComputeCost,
      monthlyOrders: 100,
      customerAcquisitionCost: adjustedCAC,
      purchasesPerCustomer: channel.purchasesPerCustomer,
    });
    const blockers: string[] = [];

    if (scenario.ltvToCacRatio < minLtvToCacRatio) {
      blockers.push(`LTV:CAC below ${minLtvToCacRatio}x`);
    }
    if (scenario.profitAfterCAC < 0) {
      blockers.push("Negative contribution after CAC");
    }

    return {
      id: channel.id,
      label: channel.label,
      weeklyBudgetCap: Math.max(channel.weeklyBudgetCap, 0),
      baselineCAC: channel.baselineCAC,
      adjustedCAC,
      previewLiftPercent: previewLift,
      purchasesPerCustomer: channel.purchasesPerCustomer,
      ltvToCacRatio: scenario.ltvToCacRatio,
      profitAfterCAC: scenario.profitAfterCAC,
      score: blockers.length === 0 ? roundCurrency(Math.max(scenario.profitAfterCAC, 0) * Math.max(scenario.ltvToCacRatio, 0)) : 0,
      eligible: blockers.length === 0,
      blockers,
      recommendedWeeklyBudget: 0,
    };
  });

  let remainingBudget = Math.max(totalWeeklyBudget, 0);
  let eligibleAllocations = allocations.filter((allocation) => allocation.eligible && allocation.weeklyBudgetCap > 0);

  while (remainingBudget > 0.005 && eligibleAllocations.length > 0) {
    const roundBudget = remainingBudget;
    const totalScore = eligibleAllocations.reduce((sum, allocation) => sum + allocation.score, 0);
    let allocatedThisRound = 0;

    eligibleAllocations.forEach((allocation) => {
      const weightedShare =
        totalScore > 0
          ? roundBudget * (allocation.score / totalScore)
          : roundBudget / eligibleAllocations.length;
      const roomToCap = allocation.weeklyBudgetCap - allocation.recommendedWeeklyBudget;
      const increment = Math.min(roomToCap, weightedShare);

      if (increment > 0) {
        allocation.recommendedWeeklyBudget += increment;
        remainingBudget -= increment;
        allocatedThisRound += increment;
      }
    });

    eligibleAllocations = eligibleAllocations.filter(
      (allocation) => allocation.weeklyBudgetCap - allocation.recommendedWeeklyBudget > 0.005,
    );

    if (allocatedThisRound === 0) {
      break;
    }
  }

  allocations.forEach((allocation) => {
    allocation.recommendedWeeklyBudget = Math.round(allocation.recommendedWeeklyBudget);
  });

  const allocatedBudget = allocations.reduce((sum, allocation) => sum + allocation.recommendedWeeklyBudget, 0);
  const recommended = allocations
    .filter((allocation) => allocation.recommendedWeeklyBudget > 0)
    .sort((a, b) => b.recommendedWeeklyBudget - a.recommendedWeeklyBudget || b.score - a.score)[0];

  return {
    allocations,
    allocatedBudget,
    unallocatedBudget: Math.max(Math.round(totalWeeklyBudget - allocatedBudget), 0),
    recommendedChannelId: recommended?.id ?? null,
  };
}

export function calculateRoomPreviewExperiment(
  artwork: CatalogArtwork,
  {
    monthlyVisitors,
    baselineConversionRate,
    baselineCAC,
    previewEngagementRate,
    conversionLiftPercent,
    purchasesPerCustomer,
  }: RoomPreviewExperimentInput,
) {
  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });
  const blockers: string[] = [];

  if (!artwork.hasRoomMockups) {
    blockers.push("Generate room mockups");
  }
  if (!artwork.hasApprovedProof || artwork.status !== "Live") {
    blockers.push("Approve artist proof");
  }

  const baselineOrders = roundCurrency(monthlyVisitors * (baselineConversionRate / 100));
  const previewVisitors = monthlyVisitors * (Math.max(previewEngagementRate, 0) / 100);
  const previewBaselineOrders = previewVisitors * (baselineConversionRate / 100);
  const eligibleLiftPercent = blockers.length === 0 ? Math.max(conversionLiftPercent, 0) : 0;
  const incrementalOrders = roundCurrency(previewBaselineOrders * (eligibleLiftPercent / 100));
  const projectedOrders = roundCurrency(baselineOrders + incrementalOrders);
  const blendedConversionRate =
    monthlyVisitors > 0 ? roundCurrency((projectedOrders / monthlyVisitors) * 100) : 0;
  const adjustedCAC =
    blendedConversionRate > 0
      ? roundCurrency(baselineCAC * (baselineConversionRate / blendedConversionRate))
      : baselineCAC;

  return {
    baselineOrders,
    projectedOrders,
    incrementalOrders,
    blendedConversionRate,
    adjustedCAC,
    monthlyIncrementalArtistPayout: roundCurrency(incrementalOrders * economics.artistShare),
    blockers,
    channelScenario: calculateChannelScenario({
      retailPrice: artwork.retailPrice,
      fulfillmentCost: artwork.fulfillmentCost,
      monthlyOrders: projectedOrders,
      customerAcquisitionCost: adjustedCAC,
      purchasesPerCustomer,
    }),
  };
}

export function calculateCreativeReadiness(
  artwork: CatalogArtwork,
  { baselineCAC = 68 }: CreativeReadinessOptions = {},
) {
  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });
  const metadataScore = Math.min(30, artwork.tags.length * 5 + (artwork.hasSeoCopy ? 10 : 0));
  const mockupScore = artwork.hasRoomMockups ? 30 : 8;
  const proofScore = artwork.hasApprovedProof && artwork.status === "Live" ? 20 : 5;
  const marginScore = economics.marginPercent >= 45 ? 20 : economics.marginPercent >= 35 ? 12 : 0;
  const score = metadataScore + mockupScore + proofScore + marginScore;
  const blockers: string[] = [];

  if (!artwork.hasApprovedProof || artwork.status !== "Live") {
    blockers.push("Approve artist proof");
  }
  if (!artwork.hasRoomMockups) {
    blockers.push("Generate room mockups");
  }
  if (artwork.tags.length < 2 || !artwork.hasSeoCopy) {
    blockers.push("Improve SEO tags/copy");
  }
  if (economics.marginPercent < 35) {
    blockers.push("Raise price or reduce POD cost");
  }

  const predictedCacReductionPercent = roundCurrency(Math.min(28, score * 0.28));

  return {
    score,
    label: score >= 85 ? "Scale paid concepts" : score >= 60 ? "Test with limits" : "Fix before spend",
    similarityRisk: (score >= 85 ? "Low" : score >= 60 ? "Moderate" : "High") as CreativeSimilarityRisk,
    predictedCacReductionPercent,
    predictedCAC: roundCurrency(baselineCAC * (1 - predictedCacReductionPercent / 100)),
    blockers,
  };
}

export function generateAdCreativeConcepts(
  artwork: CatalogArtwork,
  channel: CreativeChannel = "paid-social",
): AdCreativeConcept[] {
  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });
  const tagPhrase = artwork.tags.join(" ");
  const channelHook =
    channel === "search"
      ? "Intent-matched wall art"
      : channel === "artist-referral"
        ? `${artwork.artistName}'s collector proof`
        : "Distinct room-led concept";

  return [
    {
      format: "Room mockup carousel",
      hook: channelHook,
      message: artwork.hasRoomMockups
        ? `Show ${artwork.title} in three ${artwork.style.toLowerCase()} room scenes built from ${tagPhrase} cues.`
        : `Generate room scenes before spend so ${artwork.title} is not tested as a flat product image.`,
    },
    {
      format: "Artist payout proof",
      hook: "Transparent marketplace economics",
      message: `${artwork.artistName} earns $${economics.artistShare.toFixed(2)} artist payout on each ${artwork.title} print at today's POD cost.`,
    },
    {
      format: "Search-intent static",
      hook: "Long-tail buyer language",
      message: `${tagPhrase} wall art for buyers comparing room-ready prints under $${artwork.retailPrice}.`,
    },
  ];
}

export function calculateLaunchReadiness(artwork: CatalogArtwork) {
  const blockers: string[] = [];
  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });

  if (!artwork.hasApprovedProof || artwork.status !== "Live") {
    blockers.push("Approve proof");
  }
  if (!artwork.hasRoomMockups) {
    blockers.push("Add room mockups");
  }
  if (economics.marginPercent < 35) {
    blockers.push("Improve margin");
  }

  const score =
    artwork.readinessScore ??
    [
      artwork.imageClass ? 20 : 0,
      artwork.hasApprovedProof && artwork.status === "Live" ? 20 : 0,
      artwork.tags.length > 0 && artwork.hasSeoCopy ? 20 : 0,
      artwork.hasRoomMockups ? 20 : 0,
      economics.marginPercent >= 35 ? 20 : 0,
    ].reduce((sum, value) => sum + value, 0);

  return {
    score,
    label: score >= 85 ? "Launch-ready" : score >= 65 ? "Improve listing" : "Needs work",
    blockers,
  };
}

export function calculateCatalogSummary(artworks: CatalogArtwork[]) {
  const readinessScores = artworks.map((artwork) => calculateLaunchReadiness(artwork).score);
  const projectedMonthlyArtistPayout = artworks.reduce(
    (sum, artwork) => sum + artwork.projectedMonthlyArtistPayout,
    0,
  );

  return {
    totalArtworks: artworks.length,
    liveArtworks: artworks.filter((artwork) => artwork.status === "Live").length,
    proofQueue: artworks.filter((artwork) => artwork.status === "Proof pending").length,
    averageReadinessScore: Math.round(
      readinessScores.reduce((sum, score) => sum + score, 0) / Math.max(readinessScores.length, 1),
    ),
    projectedMonthlyArtistPayout: roundCurrency(projectedMonthlyArtistPayout),
  };
}
