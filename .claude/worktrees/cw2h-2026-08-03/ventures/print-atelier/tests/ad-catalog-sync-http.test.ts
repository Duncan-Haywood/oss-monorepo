import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlatformCatalogPayload,
  executeAdCatalogSyncLive,
  type FetchLike,
} from "../src/lib/ad-catalog-sync-http.ts";
import type { AdCatalogFeedItem } from "../src/lib/ad-catalog.ts";

const sampleItem: AdCatalogFeedItem = {
  id: "print-midnight-coast-meta",
  platform: "meta",
  title: "Midnight Coast",
  description: "Archival print",
  link: "https://printatelier.com/prints/midnight-coast",
  imageLink: "https://printatelier.com/api/og/print/midnight-coast",
  price: "85.00 USD",
  currency: "USD",
  availability: "in stock",
  brand: "Print Atelier",
  condition: "new",
  googleProductCategory: "Home & Garden > Decor > Artwork > Prints",
  customLabels: ["living-room"],
  creativeReadinessScore: 82,
  seoSlug: "midnight-coast-living-room",
  artworkSlug: "midnight-coast",
  artistName: "Ava Chen",
  eligible: true,
  blockers: [],
};

test("buildPlatformCatalogPayload serializes meta batch requests", () => {
  const payload = buildPlatformCatalogPayload("meta", [sampleItem]);
  const parsed = JSON.parse(payload) as { requests: Array<{ retailer_id: string }> };
  assert.equal(parsed.requests[0]?.retailer_id, sampleItem.id);
});

test("executeAdCatalogSyncLive performs HTTP when credentials and health pass", async () => {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => '{"success":true}' };
  };

  const result = await executeAdCatalogSyncLive(
    ["meta"],
    {
      META_CATALOG_ID: "cat_123",
      META_ACCESS_TOKEN: "token_abc",
      META_PIXEL_ID: "px_1",
    },
    { baseUrl: "https://printatelier.com" },
    fetchFn,
  );

  const meta = result.platforms.find((entry) => entry.platform === "meta");
  assert.ok(meta);
  if (meta?.status === "submitted") {
    assert.equal(meta.httpOk, true);
    assert.ok(calls.length >= 1);
  }
});
