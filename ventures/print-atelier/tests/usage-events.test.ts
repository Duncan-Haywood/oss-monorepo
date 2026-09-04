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
    searches: 0,
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

test("counts preflight completion and export as feature events", () => {
  clearUsageEventsForTests();
  recordUsageEvent({
    name: "preflight_completed",
    path: "/print-file-preflight",
    createdAt: "2026-08-24T15:56:00.000Z",
  });
  recordUsageEvent({
    name: "preflight_exported",
    path: "/print-file-preflight",
    createdAt: "2026-08-24T15:56:10.000Z",
  });
  recordUsageEvent({
    name: "preflight_compared",
    path: "/print-file-preflight",
    createdAt: "2026-08-24T15:56:20.000Z",
  });
  const summary = getUsageEventSummary();
  assert.equal(summary.featureEvents, 3);
  assert.equal(summary.pageViews, 0);
  assert.equal(summary.searches, 0);
});

test("counts storefront search events separately from page views", () => {
  clearUsageEventsForTests();
  recordUsageEvent({ name: "storefront_search", path: "/storefront?q=blue", createdAt: "2026-08-24T00:02:00.000Z" });
  const summary = getUsageEventSummary();
  assert.equal(summary.searches, 1);
  assert.equal(summary.pageViews, 0);
  assert.equal(summary.featureEvents, 1);
});

test("counts checkout add events as feature usage", () => {
  clearUsageEventsForTests();
  recordUsageEvent({ name: "checkout_add", path: "/checkout?add=midnight-coast", createdAt: "2026-08-24T00:03:00.000Z" });

  assert.equal(getUsageEventSummary().searches, 0);
  assert.equal(getUsageEventSummary().featureEvents, 1);
});
