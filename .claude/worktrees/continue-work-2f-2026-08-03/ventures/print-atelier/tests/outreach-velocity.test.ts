import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateReplyToListingCompression,
  outreachPipelineCohort,
} from "../src/lib/outreach";

test("calculateReplyToListingCompression measures median reply-to-live hours for completed cohort paths", () => {
  const compression = calculateReplyToListingCompression({
    now: "2026-06-12T04:00:00Z",
    targetDaysToLive: 7,
  });

  assert.equal(compression.liveCount, 1);
  assert.equal(compression.inPipelineCount, 4);
  assert.ok(compression.medianHoursReplyToLive !== null);
  assert.ok(compression.medianHoursReplyToLive! > 0);
  assert.equal(compression.targetHours, 168);
  assert.equal(compression.stageFunnel.length, 6);
  assert.equal(compression.cohortPlan.length, outreachPipelineCohort.length);
  assert.ok(compression.compressionScore >= 0 && compression.compressionScore <= 100);
});

test("calculateReplyToListingCompression flags artists behind the 7-day launch track", () => {
  const compression = calculateReplyToListingCompression({
    now: "2026-06-20T04:00:00Z",
    targetDaysToLive: 7,
    cohort: [
      {
        prospectHandle: "@slow.artist",
        artistName: "Slow Artist",
        currentStage: "proof-pending",
        projectedMonthlyPayout: 200,
        stageTimestamps: {
          "outreach-sent": "2026-06-01T10:00:00Z",
          replied: "2026-06-02T14:00:00Z",
          "capture-uploaded": "2026-06-03T10:00:00Z",
          "ai-processing": "2026-06-05T10:00:00Z",
          "proof-pending": "2026-06-08T10:00:00Z",
        },
      },
    ],
  });

  assert.equal(compression.behindCount, 1);
  assert.equal(compression.onTrackCount, 0);
  assert.ok(compression.cohortPlan[0]!.blockers.includes("Awaiting proof approval"));
});
