import test from "node:test";
import assert from "node:assert/strict";

import { checkPartnerSkuSyncStatus } from "../src/lib/fulfillment-health";
import type { CatalogArtwork } from "../src/lib/marketplace";

const mockArtworks: CatalogArtwork[] = [
  {
    id: 1,
    slug: "art-one",
    title: "Art One",
    artistName: "Artist A",
    artistInitials: "AA",
    style: "Abstract",
    status: "Live",
    retailPrice: 90,
    fulfillmentCost: 30,
    imageClass: "bg-gradient",
    tags: ["Modern"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 10,
    projectedMonthlyArtistPayout: 180,
  },
  {
    id: 2,
    slug: "art-two",
    title: "Art Two",
    artistName: "Artist B",
    artistInitials: "AB",
    style: "Minimal",
    status: "Live",
    retailPrice: 80,
    fulfillmentCost: 25,
    imageClass: "bg-gradient",
    tags: ["Minimal"],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 5,
    projectedMonthlyArtistPayout: 80,
  },
];

test("checkPartnerSkuSyncStatus reports healthy status when both partners map all live catalog SKUs", () => {
  const report = checkPartnerSkuSyncStatus({
    artworks: mockArtworks,
    printfulMappings: [
      { catalogSlug: "art-one", printfulVariantId: "p1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
      { catalogSlug: "art-two", printfulVariantId: "p2", productName: "Art 2", size: "18x24", updatedAt: "2026-08-01" },
    ],
    gelatoMappings: [
      { catalogSlug: "art-one", gelatoProductUid: "g1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
      { catalogSlug: "art-two", gelatoProductUid: "g2", productName: "Art 2", size: "18x24", updatedAt: "2026-08-01" },
    ],
  });

  assert.equal(report.syncStatus, "healthy");
  assert.equal(report.printfulCoveragePercent, 100);
  assert.equal(report.gelatoCoveragePercent, 100);
  assert.equal(report.missingBothPartnersCount, 0);
  assert.equal(report.activePartnersReady.length, 2);
  assert.match(report.summaryLabel, /All 2 live SKUs fully mapped/);
});

test("checkPartnerSkuSyncStatus reports degraded status when one partner is missing mappings", () => {
  const report = checkPartnerSkuSyncStatus({
    artworks: mockArtworks,
    printfulMappings: [
      { catalogSlug: "art-one", printfulVariantId: "p1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
    ],
    gelatoMappings: [
      { catalogSlug: "art-one", gelatoProductUid: "g1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
      { catalogSlug: "art-two", gelatoProductUid: "g2", productName: "Art 2", size: "18x24", updatedAt: "2026-08-01" },
    ],
  });

  assert.equal(report.syncStatus, "degraded");
  assert.equal(report.printfulCoveragePercent, 50);
  assert.equal(report.gelatoCoveragePercent, 100);
  assert.equal(report.missingBothPartnersCount, 0);
  assert.ok(report.blockers.some((b) => b.includes("Printful missing 1 SKU mapping(s)")));
});

test("checkPartnerSkuSyncStatus reports critical status when SKU is unmapped across all partners", () => {
  const report = checkPartnerSkuSyncStatus({
    artworks: mockArtworks,
    printfulMappings: [
      { catalogSlug: "art-one", printfulVariantId: "p1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
    ],
    gelatoMappings: [
      { catalogSlug: "art-one", gelatoProductUid: "g1", productName: "Art 1", size: "18x24", updatedAt: "2026-08-01" },
    ],
  });

  assert.equal(report.syncStatus, "critical");
  assert.equal(report.missingBothPartnersCount, 1);
  assert.deepEqual(report.missingBothSlugs, ["art-two"]);
  assert.match(report.summaryLabel, /Critical SKU sync gap/);
});
