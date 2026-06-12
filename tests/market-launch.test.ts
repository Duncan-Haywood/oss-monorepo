import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMarketLaunchCommandCenter } from "../src/lib/market-launch.ts";

test("buildMarketLaunchCommandCenter aggregates supply, demand, payments, and ops gates", () => {
  const center = buildMarketLaunchCommandCenter(undefined, {}, "2026-06-12T09:00:00Z");

  assert.ok(center.overallLaunchScore >= 0 && center.overallLaunchScore <= 100);
  assert.equal(center.gates.length, 4);
  assert.ok(center.gates.some((gate) => gate.id === "supply"));
  assert.ok(center.gates.some((gate) => gate.id === "demand"));
  assert.ok(center.gates.some((gate) => gate.id === "payments"));
  assert.ok(center.supplyCompressionScore >= 0);
  assert.ok(center.demandSyncScore >= 0);
  assert.ok(center.checkoutReadiness >= 0);
});

test("buildMarketLaunchCommandCenter exposes scale readiness flags", () => {
  const center = buildMarketLaunchCommandCenter();

  assert.equal(typeof center.readyToOnboardArtists, "boolean");
  assert.equal(typeof center.readyToScaleAds, "boolean");
  assert.equal(typeof center.readyToAcceptPayments, "boolean");
});
