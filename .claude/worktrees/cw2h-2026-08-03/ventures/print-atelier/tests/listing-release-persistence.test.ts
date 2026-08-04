import test from "node:test";
import assert from "node:assert";
import {
  generateConvexListingReleaseSchema,
  persistListingReleaseDecision,
  queryPersistedListingReleaseDecisions,
  summarizePersistedListingReleaseDecisions,
  clearPersistedListingReleaseDecisionsForTest,
} from "../src/lib/listing-release-persistence.ts";

test("generateConvexListingReleaseSchema produces valid Convex table definition", () => {
  const schema = generateConvexListingReleaseSchema();
  assert.ok(schema.tableName === "listing_releases" || schema.tableName === "listing_release_decisions");
  assert.ok(schema.indexes.some((i) => i.name === "by_releaseStatus"));
});

test("persistListingReleaseDecision stores and queries release decisions", () => {
  clearPersistedListingReleaseDecisionsForTest();

  const decision = persistListingReleaseDecision({
    artworkSlug: "coastal-dunes",
    artistName: "Marcus Brody",
    title: "Coastal Dunes",
    releaseStatus: "release-ready",
    owner: "Growth",
    canUsePayoutPromise: true,
    currentArtistPayoutPerOrder: 12.5,
    bestPodAlternativeLabel: "Society6 wall art",
    podAdvantagePerOrder: 4.5,
    suggestedRetailPrice: 75,
    artistFacingCopySnapshot: "You earn 30% of net profit ($12.50/print) on Coastal Dunes.",
    action: "Release to outreach queue",
  });

  assert.ok(decision.decisionId ? decision.decisionId.startsWith("rel_") : decision.dbId.startsWith("doc_rel_"));
  assert.strictEqual(decision.releaseStatus, "release-ready");

  const results = queryPersistedListingReleaseDecisions({ owner: "Growth" });
  assert.strictEqual(results.length, 1);

  const summary = summarizePersistedListingReleaseDecisions();
  assert.strictEqual(summary.releaseReadyCount, 1);
});
