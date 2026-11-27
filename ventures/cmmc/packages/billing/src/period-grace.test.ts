import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWithinPastDueGrace,
  nextPastDueSince,
  PAST_DUE_GRACE_DAYS,
  pastDueGraceUntil,
} from "./grace.ts";
import { addMonthsUtc, periodKeyFor, quotaPeriodStart } from "./period.ts";

const DAY = 86_400_000;
const since = new Date("2026-11-10T00:00:00Z");

describe("past_due grace period", () => {
  it("lasts PAST_DUE_GRACE_DAYS from the first past_due event", () => {
    assert.equal(PAST_DUE_GRACE_DAYS, 7);
    assert.deepEqual(pastDueGraceUntil("past_due", since), new Date("2026-11-17T00:00:00Z"));
    assert.equal(
      isWithinPastDueGrace("past_due", since, new Date(since.getTime() + 6 * DAY)),
      true,
    );
    assert.equal(
      isWithinPastDueGrace("past_due", since, new Date(since.getTime() + 7 * DAY)),
      false,
    );
  });

  it("does not apply to other statuses or an unknown start", () => {
    assert.equal(pastDueGraceUntil("active", since), null);
    assert.equal(pastDueGraceUntil("canceled", since), null);
    assert.equal(pastDueGraceUntil("past_due", null), null);
    assert.equal(isWithinPastDueGrace("past_due", null, since), false);
  });

  it("supports a per-app grace length", () => {
    assert.deepEqual(pastDueGraceUntil("past_due", since, 3), new Date("2026-11-13T00:00:00Z"));
  });

  it("keeps the first past_due start across dunning retries and clears it on recovery", () => {
    const later = new Date("2026-11-12T00:00:00Z");
    const pastDue = { status: "past_due" as const, pastDueSince: since };
    assert.deepEqual(nextPastDueSince(pastDue, true, "past_due", later), since);
    // A different subscription starts its own grace.
    assert.deepEqual(nextPastDueSince(pastDue, false, "past_due", later), later);
    assert.deepEqual(
      nextPastDueSince({ status: "active", pastDueSince: null }, true, "past_due", later),
      later,
    );
    // Legacy row: past_due without a start -> starts now.
    assert.deepEqual(
      nextPastDueSince({ status: "past_due", pastDueSince: null }, true, "past_due", later),
      later,
    );
    assert.equal(nextPastDueSince(pastDue, true, "active", later), null);
  });
});

describe("quota period keys", () => {
  it("uses the UTC calendar month without an anchor (comp / none)", () => {
    assert.equal(periodKeyFor(null, new Date("2026-11-19T12:00:00Z")), "2026-11");
  });

  it("anchors on the subscription's period start (monthly anniversary)", () => {
    const anchor = new Date("2026-10-15T08:00:00Z");
    assert.equal(periodKeyFor(anchor, new Date("2026-11-14T23:00:00Z")), "2026-10");
    assert.equal(periodKeyFor(anchor, new Date("2026-11-15T08:00:00Z")), "2026-11");
  });

  it("resets monthly for annual subscriptions too", () => {
    const anchor = new Date("2026-01-10T00:00:00Z");
    assert.equal(periodKeyFor(anchor, new Date("2026-06-20T00:00:00Z")), "2026-06");
    assert.equal(periodKeyFor(anchor, new Date("2027-01-09T00:00:00Z")), "2026-12");
  });

  it("clamps month-end anchors", () => {
    assert.equal(
      addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString(),
      "2026-02-28T00:00:00.000Z",
    );
    assert.equal(
      periodKeyFor(new Date("2026-01-31T00:00:00Z"), new Date("2026-03-01T00:00:00Z")),
      "2026-02",
    );
  });

  it("falls back to the calendar month when the anchor is in the future", () => {
    assert.equal(
      periodKeyFor(new Date("2027-01-01T00:00:00Z"), new Date("2026-11-19T00:00:00Z")),
      "2026-11",
    );
  });

  it("starts the first period at the anchor itself when now is the anchor instant", () => {
    // A new subscription's usage at the very instant of its period start belongs to the
    // anchored period, not to the calendar month (red team 2026-11-27: `>` vs `>=`).
    const anchor = new Date("2026-10-15T08:00:00Z");
    assert.equal(quotaPeriodStart(anchor, new Date(anchor)).toISOString(), anchor.toISOString());
  });
});
