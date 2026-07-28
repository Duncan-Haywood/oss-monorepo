import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutreachCohortAttribution,
  outreachPipelineCohort,
  outreachProspects,
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
