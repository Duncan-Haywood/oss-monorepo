import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProductPipeline } from "../src/lib/product-pipeline.ts";

test("buildProductPipeline returns five stages and growth engines", () => {
  const pipeline = buildProductPipeline();

  assert.equal(pipeline.stages.length, 5);
  assert.equal(pipeline.stages[0]?.id, "capture");
  assert.equal(pipeline.stages[pipeline.stages.length - 1]?.id, "growth");
  assert.equal(pipeline.growthEngines.length, 3);
  assert.ok(pipeline.overallReadiness >= 0 && pipeline.overallReadiness <= 100);
  assert.ok(pipeline.summaryLabel.includes("pipeline readiness"));
});

test("buildProductPipeline reflects Printful credential readiness", () => {
  const without = buildProductPipeline();
  const withKeys = buildProductPipeline(undefined, {
    PRINTFUL_API_KEY: "key",
    PRINTFUL_STORE_ID: "store",
  });

  const fulfillmentWithout = without.stages.find((stage) => stage.id === "fulfillment");
  const fulfillmentWith = withKeys.stages.find((stage) => stage.id === "fulfillment");

  assert.ok(fulfillmentWithout);
  assert.ok(fulfillmentWith);
  assert.ok(fulfillmentWith.progressPercent >= fulfillmentWithout.progressPercent);
});
