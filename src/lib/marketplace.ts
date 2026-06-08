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
