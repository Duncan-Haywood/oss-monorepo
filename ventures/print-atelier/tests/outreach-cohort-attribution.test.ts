import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutreachCohortAttribution,
  clearOutreachAttributionEventsForTests,
  getOutreachAttributionEvents,
  outreachPipelineCohort,
  outreachProspects,
  recordOutreachAttributionEvent,
} from "../src/lib/outreach";

test("buildOutreachCohortAttribution maps reply → onboard → live funnel with platform breakdown", () => {
  const attribution = buildOutreachCohortAttribution({
    now: "2026-06-12T12:00:00Z",
    prospects: outreachProspects,
    cohort: outreachPipelineCohort,
  });

  assert.equal(attribution.rows.length, outreachProspects.length);
  assert.ok(attribution.funnelCounts["live-listing"] >= 1);
  assert.ok(attribution.conversionRates.replyRate > 0);
  assert.equal(attribution.platformBreakdown.length, 3);
  assert.ok(attribution.attributedPayoutLive > 0);
  assert.ok(attribution.summaryLabel.includes("live"));
});

test("buildOutreachCohortAttribution flags payout guardrail drop-off on thin-margin prospects", () => {
  const attribution = buildOutreachCohortAttribution({
    now: "2026-06-12T12:00:00Z",
    prospects: outreachProspects,
    cohort: outreachPipelineCohort,
  });

  const james = attribution.rows.find((row) => row.handle === "@jameswu.art");
  assert.ok(james);
  assert.equal(james.pipelineStage, "proof-pending");
  assert.equal(james.dropOffReason, "Proof approval pending");
});

test("buildOutreachCohortAttribution marks deep-link eligible replied artists", () => {
  const attribution = buildOutreachCohortAttribution({
    now: "2026-06-12T12:00:00Z",
  });

  const elena = attribution.rows.find((row) => row.handle === "@elena_paints");
  assert.ok(elena);
  assert.equal(elena.deepLinkEligible, true);
  assert.equal(elena.attributionStage, "onboard-intake");
});

test("recordOutreachAttributionEvent persists events and updates cohort attribution", () => {
  clearOutreachAttributionEventsForTests();

  const event = recordOutreachAttributionEvent({
    prospectHandle: "@maya_ceramics",
    artistName: "Maya Lin",
    sourceChannel: "Instagram",
    stage: "live-listing",
    stageTimestamp: "2026-06-11T16:00:00Z",
    catalogArtworkSlug: "clay-sunburst",
    projectedMonthlyPayout: 620,
  });

  assert.ok(event.eventId.startsWith("oae_"));
  assert.equal(getOutreachAttributionEvents().length, 1);

  const attribution = buildOutreachCohortAttribution({
    now: "2026-06-12T12:00:00Z",
  });

  const mayaRow = attribution.rows.find((row) => row.handle === "@maya_ceramics");
  assert.ok(mayaRow);
  assert.equal(mayaRow.attributionStage, "live-listing");
  assert.equal(mayaRow.pipelineStage, "live-listing");

  clearOutreachAttributionEventsForTests();
});

test("buildOutreachQueue enriches items with payout trust copy and objection templates", () => {
  const { buildOutreachQueue, generateArtistPayoutTrustCopy } = require("../src/lib/outreach");
  const queue = buildOutreachQueue(outreachProspects);

  for (const item of queue) {
    assert.ok(item.payoutTrustCopy);
    assert.ok(item.payoutTrustCopy.includes("30% net profit"));
  }

  const james = queue.find((item: any) => item.handle === "@jameswu.art");
  assert.ok(james);
  assert.ok(james.objectionTemplate);
  assert.equal(james.objectionTemplate.legalClause, "Clause 4.2 — Transparent 30% Net Profit Calculation");
});

test("buildPayoutSafeOutreachSegment classifies prospects into payout-safe, price adjustment, and blocked", () => {
  const { buildPayoutSafeOutreachSegment } = require("../src/lib/outreach");
  const result = buildPayoutSafeOutreachSegment(outreachProspects);

  assert.equal(result.totalAnalyzed, outreachProspects.length);
  assert.ok(result.payoutSafeCount > 0);
  assert.ok(result.summaryLabel.includes("payout-safe"));
  assert.equal(result.items.length, outreachProspects.length);
});

