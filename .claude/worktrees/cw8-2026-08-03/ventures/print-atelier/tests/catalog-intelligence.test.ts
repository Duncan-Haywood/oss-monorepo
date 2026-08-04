import assert from "node:assert/strict";
import test from "node:test";
import { catalogArtworks } from "../src/lib/marketplace.ts";
import {
  buildArtworkMetadataConfidence,
  buildCatalogMetadataDashboard,
  buildPrioritizedRoomMockupQueue,
  getMetadataDimensionLabel,
} from "../src/lib/catalog-intelligence.ts";

test("buildArtworkMetadataConfidence scores live listings higher than proof-pending", () => {
  const live = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  const pending = catalogArtworks.find((artwork) => artwork.slug === "abstract-no-4");
  assert.ok(live);
  assert.ok(pending);

  const liveScore = buildArtworkMetadataConfidence(live!);
  const pendingScore = buildArtworkMetadataConfidence(pending!);

  assert.ok(liveScore.overallConfidence > pendingScore.overallConfidence);
  assert.equal(liveScore.aiReady, true);
  assert.equal(pendingScore.aiReady, false);
  assert.equal(getMetadataDimensionLabel("tags"), "AI tags");
});

test("buildCatalogMetadataDashboard aggregates catalog metadata gaps", () => {
  const dashboard = buildCatalogMetadataDashboard(catalogArtworks);

  assert.equal(dashboard.artworks.length, catalogArtworks.length);
  assert.ok(dashboard.averageConfidence > 0);
  assert.ok(dashboard.topGaps.length > 0);
  assert.ok(dashboard.needsAttentionCount >= 1);
});

test("buildPrioritizedRoomMockupQueue prioritizes listings missing mockups by margin and demand", () => {
  const result = buildPrioritizedRoomMockupQueue(catalogArtworks, {
    "abstract-no-4": 95,
  });

  assert.ok(result.items.length > 0);
  assert.ok(result.missingMockupCount >= 1);
  const abstractNo4 = result.items.find((item) => item.artworkSlug === "abstract-no-4");
  assert.ok(abstractNo4);
  assert.equal(abstractNo4.hasRoomMockups, false);
  assert.equal(abstractNo4.missingPreviewDemandScore, 95);
  assert.ok(abstractNo4.generationPriorityScore > 0);
  assert.ok(abstractNo4.recommendedSceneStyles.includes("Modern Loft"));
});
