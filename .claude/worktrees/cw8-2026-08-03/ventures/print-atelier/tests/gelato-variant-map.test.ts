import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGelatoVariantMapDashboard,
  resolveGelatoProductUid,
  upsertGelatoVariantMapping,
} from "../src/lib/gelato-variant-map.ts";

test("resolveGelatoProductUid returns mapped Gelato product UID", () => {
  const uid = resolveGelatoProductUid("midnight-coast");
  assert.equal(uid, "gel_poster_18x24_matte");
});

test("buildGelatoVariantMapDashboard tracks mapping coverage for live SKUs", () => {
  const dashboard = buildGelatoVariantMapDashboard();
  assert.ok(dashboard.liveCatalogCount > 0);
  assert.equal(dashboard.mappedCount, dashboard.liveCatalogCount);
  assert.equal(dashboard.euRoutingReady, true);
});

test("upsertGelatoVariantMapping replaces slug mapping", () => {
  const next = upsertGelatoVariantMapping(
    "midnight-coast",
    "gel_custom_uid",
    "Custom print",
    "12×16 in",
  );
  const match = next.find((item) => item.catalogSlug === "midnight-coast");
  assert.equal(match?.gelatoProductUid, "gel_custom_uid");
});
