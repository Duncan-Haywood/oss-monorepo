import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, countdown, canStartInCoConstruct, LAST_DAY } from "./cocon.mjs";

test("days left to the CoConstruct cut-off", () => {
  assert.equal(LAST_DAY, "2027-03-31");
  assert.equal(daysLeft("2026-11-27"), 124); // Nov 3 + Dec 31 + Jan 31 + Feb 28 + Mar 31
  assert.equal(daysLeft("2027-03-30"), 1);
  assert.equal(daysLeft("2027-03-31"), 0);
  assert.equal(daysLeft("2027-04-01"), -1);
  // Across a DST change the count stays whole (UTC dates).
  assert.equal(daysLeft("2027-03-13"), 18);
});

test("countdown wording", () => {
  assert.match(countdown("2026-11-27"), /^124 days left/);
  assert.match(countdown("2027-03-30"), /^One day left/);
  assert.match(countdown("2027-03-31"), /^Today, 31 March 2027/);
  assert.match(countdown("2027-06-01"), /no longer be added/);
});

test("a job can be added through the last day, not after", () => {
  assert.equal(canStartInCoConstruct("2027-03-31"), true);
  assert.equal(canStartInCoConstruct("2027-04-01"), false);
  assert.throws(() => daysLeft("31/03/2027"), /not a date/);
});
