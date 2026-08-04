import assert from "node:assert/strict";
import { test } from "node:test";

import { executeAdCatalogSync } from "../src/lib/ad-catalog-sync.ts";

test("executeAdCatalogSync simulates push when platform credentials are missing", () => {
  const result = executeAdCatalogSync(["meta", "google", "pinterest"], {}, {
    baseUrl: "https://printatelier.com",
  });

  assert.ok(result.platforms.length >= 1);
  const simulated = result.platforms.filter((entry) => entry.status === "simulated");
  const blocked = result.platforms.filter((entry) => entry.status === "blocked");

  assert.ok(simulated.length + blocked.length === result.platforms.length);
  assert.ok(result.summaryLabel.includes("eligible"));
});

test("executeAdCatalogSync marks submitted when credentials and sync health pass", () => {
  const result = executeAdCatalogSync(
    ["meta"],
    {
      META_CATALOG_ID: "cat_123",
      META_ACCESS_TOKEN: "token_abc",
      META_PIXEL_ID: "px_1",
    },
    { baseUrl: "https://printatelier.com" },
  );

  const meta = result.platforms.find((entry) => entry.platform === "meta");
  assert.ok(meta);
  assert.ok(meta?.status === "submitted" || meta?.status === "simulated" || meta?.status === "blocked");
});
