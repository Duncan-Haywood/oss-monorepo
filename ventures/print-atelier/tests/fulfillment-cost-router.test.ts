import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getBaseFulfillmentQuote,
  optimizeFulfillmentRouting,
  evaluateFulfillmentRoutingBatch,
  generateConvexFulfillmentRouterSchema,
  persistFulfillmentRoutingDecision,
  getFulfillmentRouteRecords,
  clearFulfillmentRouteStoreForTesting,
  type FulfillmentRegion,
} from "../src/lib/fulfillment-cost-router";

describe("fulfillment-cost-router", () => {
  beforeEach(() => {
    clearFulfillmentRouteStoreForTesting();
  });

  it("returns quote for mapped slug and valid region", () => {
    const printfulQuote = getBaseFulfillmentQuote("printful", "midnight-coast", "US", 120);
    assert.equal(printfulQuote.availableInRegion, true);
    assert.equal(printfulQuote.variantIdOrUid, "4011");
    assert.ok(printfulQuote.totalFulfillmentCostUsd > 0);

    const gelatoQuote = getBaseFulfillmentQuote("gelato", "midnight-coast", "EU", 120);
    assert.equal(gelatoQuote.availableInRegion, true);
    assert.equal(gelatoQuote.variantIdOrUid, "gel_poster_18x24_matte");
    assert.ok(gelatoQuote.shippingCostUsd < printfulQuote.shippingCostUsd);
  });

  it("handles unmapped slugs gracefully with empty variant ID", () => {
    const quote = getBaseFulfillmentQuote("printful", "non-existent-slug", "US", 100);
    assert.equal(quote.availableInRegion, false);
    assert.equal(quote.variantIdOrUid, "");
    assert.equal(quote.totalFulfillmentCostUsd, 0);
  });

  it("optimizes routing toward Gelato in EU due to lower shipping cost", () => {
    const decision = optimizeFulfillmentRouting("midnight-coast", "EU", 120);
    assert.equal(decision.selectedProvider, "gelato");
    assert.ok(decision.costSavingsUsd > 0);
    assert.equal(decision.artistPayoutUsd, 36.0); // 30% of $120
    assert.equal(decision.isArtistPayoutGuaranteed, true);
    assert.ok(decision.routingReason.includes("Gelato saves"));
  });

  it("optimizes routing toward Printful in US when total cost is lower", () => {
    const decision = optimizeFulfillmentRouting("midnight-coast", "US", 120);
    assert.equal(decision.artistPayoutUsd, 36.0);
    assert.ok(decision.platformProfitUsd > 0);
    assert.equal(decision.isArtistPayoutGuaranteed, true);
  });

  it("flags when platform profit would be negative if retail price is too low", () => {
    const decision = optimizeFulfillmentRouting("midnight-coast", "US", 20);
    assert.equal(decision.isArtistPayoutGuaranteed, false);
    assert.ok(decision.platformProfitUsd < 0);
  });

  it("evaluates a batch of catalog items across multiple regions", () => {
    const slugs = ["midnight-coast", "urban-geometry", "spring-bloom"];
    const report = evaluateFulfillmentRoutingBatch(slugs);

    assert.equal(report.totalOrdersEvaluated, 15); // 3 slugs * 5 regions
    assert.equal(report.printfulSelectedCount + report.gelatoSelectedCount, 15);
    assert.ok(report.totalFulfillmentSavingsUsd >= 0);
    assert.equal(report.regionalBreakdown.EU.preferredProvider, "gelato");
  });

  it("generates valid Convex schema code and index metadata", () => {
    const schema = generateConvexFulfillmentRouterSchema();
    assert.equal(schema.tableName, "fulfillment_routing_records");
    assert.ok(schema.indexes.includes("by_routeId"));
    assert.ok(schema.schemaCode.includes("defineTable"));
  });

  it("persists routing decisions to Convex store and retrieves them", () => {
    const decision = optimizeFulfillmentRouting("midnight-coast", "EU", 120);
    assert.equal(decision.selectedProvider, "gelato");

    const record = persistFulfillmentRoutingDecision(decision);

    assert.ok(/^froute_/.test(record.routeId));
    assert.equal(record.catalogSlug, "midnight-coast");
    assert.equal(record.selectedProvider, "gelato");

    const history = getFulfillmentRouteRecords();
    assert.equal(history.length, 1);
    assert.equal(history[0].routeId, record.routeId);
  });
});
