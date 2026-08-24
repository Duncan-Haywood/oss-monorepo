import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearUsageEventsForTests,
  getUsageEventSummary,
  recordUsageEvent,
} from "../src/lib/usage-events";

test("records anonymous events and returns aggregate counts", () => {
  clearUsageEventsForTests();
  recordUsageEvent({ name: "page_view", path: "/storefront", createdAt: "2026-08-24T00:00:00.000Z" });
  recordUsageEvent({ name: "catalog_cta", path: "/storefront", createdAt: "2026-08-24T00:01:00.000Z" });

  assert.deepEqual(getUsageEventSummary(), {
    totalEvents: 2,
    pageViews: 1,
    featureEvents: 1,
    recentEvents: [
      { name: "catalog_cta", path: "/storefront", createdAt: "2026-08-24T00:01:00.000Z" },
      { name: "page_view", path: "/storefront", createdAt: "2026-08-24T00:00:00.000Z" },
    ],
  });
});

test("bounds the in-memory demo store", () => {
  clearUsageEventsForTests();
  for (let index = 0; index < 501; index += 1) {
    recordUsageEvent({ name: "page_view", path: "/", createdAt: String(index) });
  }

  assert.equal(getUsageEventSummary().totalEvents, 500);
});
