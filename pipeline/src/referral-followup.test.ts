/**
 * referral-followup.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises process/referral-followup.ts's pure followUpMessageText().
 */

import { followUpMessageText, REFERRAL_INCENTIVE } from "../../process/referral-followup";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function run() {
  const named = followUpMessageText({ listingAddress: "123 Main St", recipientName: "Jane" });
  assert(named.startsWith("Hi Jane —"), "should greet by name when recipientName is set");
  assert(named.includes("123 Main St"), "should include the listing address");
  assert(named.includes("quote"), "should ask for a testimonial quote");
  assert(named.includes("$10"), "should mention the referrer's discount incentive");

  const generic = followUpMessageText({ listingAddress: "456 Oak Ave" });
  assert(generic.startsWith("Hi —"), "should use a generic greeting when recipientName is omitted");
  assert(generic.includes("456 Oak Ave"), "should include the listing address");

  assert(REFERRAL_INCENTIVE.referrerReward.includes("$10"), "referrer reward should be a $10 discount, not cash");
  assert(REFERRAL_INCENTIVE.refereeReward.includes("$5"), "referee reward should be a $5 discount, not cash");

  console.log("referral-followup.test.ts: all assertions passed");
}

run();
