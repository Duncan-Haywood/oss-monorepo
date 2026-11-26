import { describe, expect, it } from "vitest";
import { isWithinPastDueGrace, PAST_DUE_GRACE_DAYS, pastDueGraceUntil } from "./grace";

const DAY = 86_400_000;
const since = new Date("2026-11-10T00:00:00Z");

describe("past_due grace period", () => {
  it("lasts PAST_DUE_GRACE_DAYS from the first past_due event", () => {
    expect(PAST_DUE_GRACE_DAYS).toBe(7);
    expect(pastDueGraceUntil("past_due", since)).toEqual(new Date("2026-11-17T00:00:00Z"));
    expect(isWithinPastDueGrace("past_due", since, new Date(since.getTime() + 6 * DAY))).toBe(true);
    expect(isWithinPastDueGrace("past_due", since, new Date(since.getTime() + 7 * DAY))).toBe(
      false,
    );
  });

  it("does not apply to other statuses or an unknown start", () => {
    expect(pastDueGraceUntil("active", since)).toBeNull();
    expect(pastDueGraceUntil("canceled", since)).toBeNull();
    expect(pastDueGraceUntil("past_due", null)).toBeNull();
    expect(isWithinPastDueGrace("past_due", null, since)).toBe(false);
  });
});
