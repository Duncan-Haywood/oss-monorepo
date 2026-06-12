import {
  calculateLaunchReadiness,
  calculatePrintEconomics,
  catalogArtworks,
  type CatalogArtwork,
} from "@/lib/marketplace";

export type MetadataDimension = "tags" | "seo-copy" | "room-mockups" | "proof";

export type MetadataDimensionScore = {
  dimension: MetadataDimension;
  score: number;
  confidence: "high" | "medium" | "low";
  gaps: string[];
  recommendation: string;
};

export type ArtworkMetadataConfidence = {
  artworkSlug: string;
  artworkTitle: string;
  artistName: string;
  overallConfidence: number;
  aiReady: boolean;
  dimensions: MetadataDimensionScore[];
  blockers: string[];
  priorityRank: number;
};

export type CatalogMetadataDashboard = {
  artworks: ArtworkMetadataConfidence[];
  averageConfidence: number;
  aiReadyCount: number;
  needsAttentionCount: number;
  topGaps: string[];
};

const dimensionLabels: Record<MetadataDimension, string> = {
  tags: "AI tags",
  "seo-copy": "SEO copy",
  "room-mockups": "Room mockups",
  proof: "Proof approval",
};

function scoreTags(artwork: CatalogArtwork): MetadataDimensionScore {
  const tagCount = artwork.tags.length;
  const score = Math.min(100, tagCount * 20 + (artwork.hasSeoCopy ? 20 : 0));
  const gaps: string[] = [];
  if (tagCount < 3) gaps.push("Add at least 3 style/room tags");
  if (tagCount < 5) gaps.push("Expand long-tail tag coverage for SEO");
  const confidence: MetadataDimensionScore["confidence"] =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return {
    dimension: "tags",
    score,
    confidence,
    gaps,
    recommendation:
      confidence === "high"
        ? "Tags are strong enough for programmatic SEO and ad targeting."
        : "Run AI tagger on capture upload; add room-style and decor-intent tags.",
  };
}

function scoreSeoCopy(artwork: CatalogArtwork): MetadataDimensionScore {
  const score = artwork.hasSeoCopy ? (artwork.tags.length >= 2 ? 90 : 60) : 20;
  const gaps: string[] = [];
  if (!artwork.hasSeoCopy) gaps.push("Generate SEO title and meta description");
  if (artwork.tags.length < 2) gaps.push("SEO copy needs tag anchors");
  const confidence: MetadataDimensionScore["confidence"] =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return {
    dimension: "seo-copy",
    score,
    confidence,
    gaps,
    recommendation:
      confidence === "high"
        ? "Publish to programmatic SEO lab and static print routes."
        : "Generate listing copy from tags + artist story before ad spend.",
  };
}

function scoreRoomMockups(artwork: CatalogArtwork): MetadataDimensionScore {
  const score = artwork.hasRoomMockups ? 95 : artwork.hasApprovedProof ? 40 : 10;
  const gaps: string[] = [];
  if (!artwork.hasRoomMockups) gaps.push("Generate room-scene mockups");
  const confidence: MetadataDimensionScore["confidence"] =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return {
    dimension: "room-mockups",
    score,
    confidence,
    gaps,
    recommendation:
      confidence === "high"
        ? "Room preview CAC lift assumptions are defensible."
        : "Prioritize mockups for high-margin listings before paid demand.",
  };
}

function scoreProof(artwork: CatalogArtwork): MetadataDimensionScore {
  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });
  const score =
    artwork.hasApprovedProof && artwork.status === "Live"
      ? economics.marginPercent >= 35
        ? 100
        : 70
      : artwork.hasApprovedProof
        ? 50
        : 15;
  const gaps: string[] = [];
  if (!artwork.hasApprovedProof) gaps.push("Approve print proof");
  if (artwork.status !== "Live") gaps.push("Listing not live");
  if (economics.marginPercent < 35) gaps.push("Margin below 35% payout guardrail");
  const confidence: MetadataDimensionScore["confidence"] =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return {
    dimension: "proof",
    score,
    confidence,
    gaps,
    recommendation:
      confidence === "high"
        ? "Safe for storefront, outreach payout proof, and paid ads."
        : "Hold outreach until proof and margin clear payout promise guardrails.",
  };
}

export function buildArtworkMetadataConfidence(artwork: CatalogArtwork): ArtworkMetadataConfidence {
  const dimensions = [scoreTags(artwork), scoreSeoCopy(artwork), scoreRoomMockups(artwork), scoreProof(artwork)];
  const overallConfidence = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length,
  );
  const readiness = calculateLaunchReadiness(artwork);
  const blockerSet = new Set([
    ...dimensions.filter((dimension) => dimension.confidence === "low").flatMap((dimension) => dimension.gaps),
    ...readiness.blockers,
  ]);
  const blockers = Array.from(blockerSet);
  const aiReady = overallConfidence >= 85 && readiness.blockers.length === 0;

  return {
    artworkSlug: artwork.slug,
    artworkTitle: artwork.title,
    artistName: artwork.artistName,
    overallConfidence,
    aiReady,
    dimensions,
    blockers,
    priorityRank: 100 - overallConfidence,
  };
}

export function buildCatalogMetadataDashboard(
  artworks: CatalogArtwork[] = catalogArtworks,
): CatalogMetadataDashboard {
  const items = artworks
    .map((artwork) => buildArtworkMetadataConfidence(artwork))
    .sort((a, b) => b.priorityRank - a.priorityRank);

  const gapCounts = new Map<string, number>();
  for (const item of items) {
    for (const gap of item.blockers) {
      gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
    }
  }
  const topGaps = Array.from(gapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gap]) => gap);

  return {
    artworks: items,
    averageConfidence: Math.round(
      items.reduce((sum, item) => sum + item.overallConfidence, 0) / Math.max(items.length, 1),
    ),
    aiReadyCount: items.filter((item) => item.aiReady).length,
    needsAttentionCount: items.filter((item) => item.overallConfidence < 70).length,
    topGaps,
  };
}

export function getMetadataDimensionLabel(dimension: MetadataDimension): string {
  return dimensionLabels[dimension];
}
