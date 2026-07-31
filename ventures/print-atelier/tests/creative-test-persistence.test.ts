import test from "node:test";
import assert from "node:assert/strict";
import {
  recordCreativeTest,
  getCreativeTests,
  clearCreativeTests,
  updateCreativeTestActuals,
  summarizeCreativeTests,
} from "../src/lib/creative-test-persistence";

test("creative test persistence records and calculates CAC/winner status correctly", () => {
  clearCreativeTests();

  const testRecord = recordCreativeTest({
    conceptName: "Scandi Minimalist Living Room Mockup",
    channel: "meta",
    predictedCac: 24.5,
    impressions: 15000,
    clicks: 450,
    conversions: 5,
    spendUsd: 110.0,
    status: "active",
  });

  assert.equal(testRecord.conceptName, "Scandi Minimalist Living Room Mockup");
  assert.equal(testRecord.channel, "meta");
  assert.equal(testRecord.actualCac, 22.0); // 110 / 5
  assert.equal(testRecord.winningConcept, true); // 22.0 <= 24.5 and conversions >= 3

  const allTests = getCreativeTests();
  assert.equal(allTests.length, 1);
  assert.equal(allTests[0].testId, testRecord.testId);
});

test("updateCreativeTestActuals updates metrics and winning status", () => {
  clearCreativeTests();

  const testRecord = recordCreativeTest({
    conceptName: "Boho Gallery Wall Carousel",
    channel: "pinterest",
    predictedCac: 20.0,
    impressions: 5000,
    clicks: 100,
    conversions: 0,
    spendUsd: 40.0,
    status: "active",
  });

  assert.equal(testRecord.winningConcept, false);

  const updated = updateCreativeTestActuals(
    testRecord.testId,
    90.0, // spend
    6, // conversions
    12000, // impressions
    360, // clicks
  );

  assert.notEqual(updated, null);
  assert.equal(updated?.actualCac, 15.0); // 90 / 6
  assert.equal(updated?.winningConcept, true); // 15 <= 20
  assert.equal(updated?.status, "completed");
});

test("summarizeCreativeTests summarizes aggregate performance across tests", () => {
  clearCreativeTests();

  recordCreativeTest({
    conceptName: "Concept A",
    channel: "meta",
    predictedCac: 25.0,
    impressions: 10000,
    clicks: 300,
    conversions: 4,
    spendUsd: 80.0,
    status: "completed",
  });

  recordCreativeTest({
    conceptName: "Concept B",
    channel: "google",
    predictedCac: 30.0,
    impressions: 8000,
    clicks: 200,
    conversions: 2,
    spendUsd: 70.0,
    status: "active",
  });

  const summary = summarizeCreativeTests();
  assert.equal(summary.totalTests, 2);
  assert.equal(summary.winningConceptsCount, 1); // Concept A actual CAC 20.0 <= 25.0, conversions 4 >= 3
  assert.equal(summary.totalSpendUsd, 150.0);
  assert.equal(summary.totalConversions, 6);
  assert.equal(summary.blendedActualCac, 25.0); // 150 / 6
});
