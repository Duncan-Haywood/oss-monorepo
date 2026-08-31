import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearEngagementLogForTests,
  getEngagementSummary,
  recordEngagementEvent,
} from "../engagement-log.js";

test("records anonymous page views and CTA clicks, most-recent first", () => {
  clearEngagementLogForTests();
  recordEngagementEvent({ name: "page_view", path: "/", createdAt: "2026-08-24T00:00:00.000Z" });
  recordEngagementEvent({
    name: "owner_value_cta_click",
    path: "/",
    createdAt: "2026-08-24T00:01:00.000Z",
  });

  const summary = getEngagementSummary();
  assert.equal(summary.totalEvents, 2);
  assert.equal(summary.pageViewCount, 1);
  assert.equal(summary.ctaClicks, 1);
  assert.deepEqual(summary.recentEvents[0], {
    name: "owner_value_cta_click",
    path: "/",
    createdAt: "2026-08-24T00:01:00.000Z",
  });
});

test("counts distinct tour sections visited, not raw page-view count", () => {
  clearEngagementLogForTests();
  recordEngagementEvent({ name: "page_view", path: "/", createdAt: "t1" });
  recordEngagementEvent({ name: "page_view", path: "/", createdAt: "t2" });
  recordEngagementEvent({ name: "page_view", path: "/value", createdAt: "t3" });

  const summary = getEngagementSummary();
  assert.equal(summary.pageViewCount, 3);
  assert.equal(summary.sectionsVisited, 2);
  assert.equal(summary.sectionsTotal, 6);
  assert.deepEqual(summary.visitedPaths.sort(), ["/", "/value"]);
});

test("bounds the in-memory log so a long-running demo session cannot grow it unboundedly", () => {
  clearEngagementLogForTests();
  for (let index = 0; index < 250; index += 1) {
    recordEngagementEvent({ name: "page_view", path: "/", createdAt: String(index) });
  }

  assert.equal(getEngagementSummary().totalEvents, 200);
});

test("never records more than the tour's known sections as visited, even for unknown paths", () => {
  clearEngagementLogForTests();
  recordEngagementEvent({ name: "page_view", path: "/not-a-real-route", createdAt: "t1" });

  assert.equal(getEngagementSummary().sectionsVisited, 0);
});

test("live KPI views do not inflate presenter CTA counts", () => {
  clearEngagementLogForTests();
  recordEngagementEvent({ name: "kpis_live_viewed", path: "/", createdAt: "t1" });
  recordEngagementEvent({ name: "kpis_api_unreachable", path: "/", createdAt: "t2" });
  recordEngagementEvent({
    name: "owner_value_cta_click",
    path: "/",
    createdAt: "t3",
  });

  assert.equal(getEngagementSummary().ctaClicks, 1);
});
