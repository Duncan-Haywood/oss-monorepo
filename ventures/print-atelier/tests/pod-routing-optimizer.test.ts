import assert from "node:assert/strict";
import test from "node:test";
import {
  optimizePodRouting,
  resolveRegionFromCountry,
  calculateFacilityOption,
  defaultPodFacilities,
} from "../src/lib/pod-routing-optimizer";

test("resolves ISO country codes to fulfillment regions accurately", () => {
  assert.equal(resolveRegionFromCountry("US"), "US");
  assert.equal(resolveRegionFromCountry("CA"), "US");
  assert.equal(resolveRegionFromCountry("GB"), "UK");
  assert.equal(resolveRegionFromCountry("DE"), "EU");
  assert.equal(resolveRegionFromCountry("FR"), "EU");
  assert.equal(resolveRegionFromCountry("JP"), "APAC");
  assert.equal(resolveRegionFromCountry("AU"), "APAC");
  assert.equal(resolveRegionFromCountry("BR"), "ROW");
});

test("calculates facility option costs and guarantees 30% artist net profit payout", () => {
  const facility = defaultPodFacilities[0];
  const option = calculateFacilityOption(facility, "coastal-serenity", "US", 100.0, 1);

  assert.equal(option.facility.id, "pf-charlotte-us");
  assert.equal(option.provider, "printful");
  assert.ok(option.totalFulfillmentCostUsd > 0);
  assert.ok(option.artistPayoutUsd > 0);
  assert.ok(option.platformProfitUsd > 0);
});

test("optimizes routing for EU destination with margin maximization", () => {
  const decision = optimizePodRouting({
    catalogSlug: "abstract-harmony",
    destinationCountryCode: "DE",
    destinationRegion: "EU",
    priority: "margin_maximized",
    customRetailPriceUsd: 120.0,
  });

  assert.equal(decision.destinationRegion, "EU");
  assert.equal(decision.isArtistPayoutProtected, true);
  assert.ok(decision.selectedOption.platformProfitUsd > 0);
  assert.ok(decision.routingSummary.includes("Abstract Harmony"));
});

test("optimizes routing for APAC destination with speed priority", () => {
  const decision = optimizePodRouting({
    catalogSlug: "urban-refinement",
    destinationCountryCode: "JP",
    priority: "fastest",
    customRetailPriceUsd: 150.0,
  });

  assert.equal(decision.destinationRegion, "APAC");
  assert.ok(decision.selectedOption.estimatedDeliveryDaysMin <= 5);
});
