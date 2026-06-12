import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPrintfulVariantMapDashboard,
  defaultPrintfulVariantMappings,
  resolvePrintfulVariantId,
  upsertPrintfulVariantMapping,
} from "../src/lib/printful-variant-map.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";

test("resolvePrintfulVariantId returns mapped Printful variant ID", () => {
  assert.equal(resolvePrintfulVariantId("midnight-coast"), "4011");
  assert.equal(resolvePrintfulVariantId("unknown-slug"), null);
});

test("buildPrintfulVariantMapDashboard tracks mapping coverage for live SKUs", () => {
  const dashboard = buildPrintfulVariantMapDashboard(catalogArtworks, defaultPrintfulVariantMappings);
  assert.ok(dashboard.liveCatalogCount >= 5);
  assert.ok(dashboard.mappedCount >= 5);
  assert.equal(dashboard.unmappedCount, dashboard.liveCatalogCount - dashboard.mappedCount);
  assert.ok(dashboard.mappingCoveragePercent >= 80);
});

test("upsertPrintfulVariantMapping replaces slug mapping", () => {
  const next = upsertPrintfulVariantMapping(
    "midnight-coast",
    "9999",
    "Test poster",
    "12×16 in",
    defaultPrintfulVariantMappings,
  );
  assert.equal(resolvePrintfulVariantId("midnight-coast", next), "9999");
});
