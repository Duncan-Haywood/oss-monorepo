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

test("event-sourced artists are attributed to their real channel, not defaulted to Instagram", () => {
  clearOutreachAttributionEventsForTests();

  recordOutreachAttributionEvent({
    prospectHandle: "@tiktok_only_artist",
    artistName: "Rina Okada",
    sourceChannel: "TikTok",
    stage: "live-listing",
    stageTimestamp: "2026-06-11T16:00:00Z",
    projectedMonthlyPayout: 400,
  });
  recordOutreachAttributionEvent({
    prospectHandle: "@pinterest_only_artist",
    artistName: "Cole Bennett",
    sourceChannel: "Pinterest",
    stage: "replied",
    stageTimestamp: "2026-06-11T17:00:00Z",
    projectedMonthlyPayout: 250,
  });

  const attribution = buildOutreachCohortAttribution({ now: "2026-06-12T12:00:00Z" });

  const rina = attribution.rows.find((row) => row.handle === "@tiktok_only_artist");
  const cole = attribution.rows.find((row) => row.handle === "@pinterest_only_artist");
  assert.ok(rina);
  assert.ok(cole);
  assert.equal(rina.platform, "TikTok");
  assert.equal(cole.platform, "Pinterest");

  // The breakdown feeds channel budget allocation, so misattribution here
  // would shift real spend toward the wrong channel.
  const tiktok = attribution.platformBreakdown.find((row) => row.platform === "TikTok");
  const pinterest = attribution.platformBreakdown.find((row) => row.platform === "Pinterest");
  assert.ok(tiktok);
  assert.ok(pinterest);
  assert.equal(tiktok.live, 1);
  assert.ok(tiktok.projectedPayout >= 400);
  assert.ok(pinterest.projectedPayout >= 250);

  clearOutreachAttributionEventsForTests();
});

test("a later attribution event corrects the recorded source channel", () => {
  clearOutreachAttributionEventsForTests();

  recordOutreachAttributionEvent({
    prospectHandle: "@rechanneled_artist",
    artistName: "Ada Silva",
    sourceChannel: "Instagram",
    stage: "outreach-sent",
    stageTimestamp: "2026-06-10T10:00:00Z",
  });
  recordOutreachAttributionEvent({
    prospectHandle: "@rechanneled_artist",
    artistName: "Ada Silva",
    sourceChannel: "Pinterest",
    stage: "replied",
    stageTimestamp: "2026-06-11T10:00:00Z",
  });

  const attribution = buildOutreachCohortAttribution({ now: "2026-06-12T12:00:00Z" });
  const ada = attribution.rows.find((row) => row.handle === "@rechanneled_artist");
  assert.ok(ada);
  assert.equal(ada.platform, "Pinterest");

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

