import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutreachQueue,
  calculateOutreachSummary,
  classifyProspectReply,
  outreachProspects,
  generateOutreachPayoutTrustMathPersonalization,
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

test("buildOutreachQueue holds upload replies when payout guardrails fail", () => {
  const queue = buildOutreachQueue([
    {
      name: "Alex Jenkins",
      handle: "@abstractalex",
      platform: "Instagram",
      followers: 5200,
      status: "Replied",
      fitScore: 88,
      styleSignal: "Abstract print has demand but weak POD economics",
      replyText: "Please send the upload link and earnings estimate.",
      projectedMonthlyArtistPayout: 0,
      catalogArtworkSlug: "abstract-no-4",
    },
  ]);

  assert.equal(queue[0].replyClassification, "Ready for upload link");
  assert.equal(queue[0].payoutGuardrail?.severity, "critical");
  assert.match(queue[0].nextAction, /Hold outreach/);
  assert.match(queue[0].nextAction, /Raise retail price to \$93/);
});

test("buildOutreachQueue holds draft outreach when payout guardrails fail", () => {
  const queue = buildOutreachQueue([
    {
      name: "Alex Jenkins",
      handle: "@abstractalex",
      platform: "Instagram",
      followers: 5200,
      status: "Draft",
      fitScore: 88,
      styleSignal: "Abstract print has demand but weak POD economics",
      projectedMonthlyArtistPayout: 0,
      catalogArtworkSlug: "abstract-no-4",
    },
  ]);

  assert.equal(queue[0].replyClassification, "No reply yet");
  assert.equal(queue[0].payoutGuardrail?.severity, "critical");
  assert.match(queue[0].nextAction, /Hold outreach/);
});

test("calculateOutreachSummary measures reply pipeline health and onboarding value", () => {
  const summary = calculateOutreachSummary(outreachProspects);

  assert.equal(summary.totalProspects, 6);
  assert.equal(summary.repliedProspects, 3);
  assert.equal(summary.readyForOnboarding, 1);
  assert.equal(summary.averageFitScore, 86);
  assert.equal(summary.projectedMonthlyArtistPayout, 2376);
  assert.equal(summary.automationLabel, "3 replies need AI follow-up; 1 can enter onboarding now");
});

test("calculateOutreachSummary excludes held payout-guardrail replies from onboarding-ready metrics", () => {
  const summary = calculateOutreachSummary([
    {
      name: "Alex Jenkins",
      handle: "@abstractalex",
      platform: "Instagram",
      followers: 5200,
      status: "Replied",
      fitScore: 88,
      styleSignal: "Abstract print has demand but weak POD economics",
      replyText: "Please send the upload link and earnings estimate.",
      projectedMonthlyArtistPayout: 0,
      catalogArtworkSlug: "abstract-no-4",
    },
  ]);

  assert.equal(summary.repliedProspects, 1);
  assert.equal(summary.readyForOnboarding, 0);
  assert.equal(summary.automationLabel, "1 replies need AI follow-up; 0 can enter onboarding now");
});

test("generates personalized payout trust math for outreach prospects", () => {
  const result = generateOutreachPayoutTrustMathPersonalization(outreachProspects[0]);

  assert.ok(result.personalizationText.includes("At a $"));
  assert.ok(result.personalizationText.includes("Society6's"));
  assert.ok(result.earningsAdvantagePercent > 0);

  const queue = buildOutreachQueue(outreachProspects);
  assert.ok(queue[0].payoutTrustMathPersonalization);
  assert.ok(queue[0].payoutTrustMathPersonalization.includes("Society6"));
});

