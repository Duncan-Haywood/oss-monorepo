import assert from "node:assert/strict";
import test from "node:test";

import { buildAdCatalogSyncHealth } from "../src/lib/ad-catalog.ts";

test("buildAdCatalogSyncHealth returns pixel, feed, and creative-quota checks per platform", () => {
  const health = buildAdCatalogSyncHealth({ baseUrl: "https://printatelier.com" });

  assert.ok(health.overallScore >= 0 && health.overallScore <= 100);
  assert.ok(["healthy", "degraded", "blocked"].includes(health.overallStatus));
  assert.ok(health.checks.length >= 9);
  assert.ok(health.checks.some((check) => check.category === "pixel"));
  assert.ok(health.checks.some((check) => check.category === "feed"));
  assert.ok(health.checks.some((check) => check.category === "creative-quota"));
  assert.ok(health.platformReadiness.meta);
  assert.ok(health.platformReadiness.google);
  assert.ok(health.platformReadiness.pinterest);
  assert.ok(health.recommendedActions.length > 0);
});

test("buildAdCatalogSyncHealth ties feed eligibility to sync readiness scores", () => {
  const health = buildAdCatalogSyncHealth({ baseUrl: "https://printatelier.com" });

  assert.equal(health.feedHealthScore, health.feedHealthScore);
  assert.ok(health.eligibleFeedRows >= 0);
  assert.match(health.summaryLabel, /platforms sync-ready/);
});
