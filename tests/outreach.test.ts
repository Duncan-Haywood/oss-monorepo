import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutreachQueue,
  calculateOutreachSummary,
  classifyProspectReply,
  outreachProspects,
} from "../src/lib/outreach";

test("classifyProspectReply turns reply intent into onboarding actions", () => {
  assert.equal(
    classifyProspectReply("I love this, send me the upload link and earnings estimate."),
    "Ready for upload link",
  );
  assert.equal(
    classifyProspectReply("What are the artist payout terms and do I keep the original rights?"),
    "Needs payout/licensing answer",
  );
  assert.equal(
    classifyProspectReply("Can you send examples of room mockups first?"),
    "Send proof mockup",
  );
});

test("buildOutreachQueue prioritizes high-fit replies before passive opens", () => {
  const queue = buildOutreachQueue(outreachProspects);

  assert.equal(queue[0].handle, "@elena_paints");
  assert.equal(queue[0].priorityScore, 97);
  assert.equal(queue[0].replyClassification, "Ready for upload link");
  assert.equal(queue[0].nextAction, "Send capture upload link + payout calculator");
  assert.equal(queue[queue.length - 1].status, "Draft");
});

test("calculateOutreachSummary measures reply pipeline health and onboarding value", () => {
  const summary = calculateOutreachSummary(outreachProspects);

  assert.equal(summary.totalProspects, 6);
  assert.equal(summary.repliedProspects, 2);
  assert.equal(summary.readyForOnboarding, 1);
  assert.equal(summary.averageFitScore, 86);
  assert.equal(summary.projectedMonthlyArtistPayout, 2376);
  assert.equal(summary.automationLabel, "2 replies need AI follow-up; 1 can enter onboarding now");
});
