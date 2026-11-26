import { describe, expect, it } from "vitest";
import { addMonthsUtc, periodKeyFor } from "./period";

describe("quota period keys", () => {
  it("uses the UTC calendar month without an anchor (comp / none)", () => {
    expect(periodKeyFor(null, new Date("2026-11-19T12:00:00Z"))).toBe("2026-11");
  });

  it("anchors on the subscription's period start (monthly anniversary)", () => {
    const anchor = new Date("2026-10-15T08:00:00Z");
    expect(periodKeyFor(anchor, new Date("2026-11-14T23:00:00Z"))).toBe("2026-10");
    expect(periodKeyFor(anchor, new Date("2026-11-15T08:00:00Z"))).toBe("2026-11");
  });

  it("resets monthly for annual subscriptions too", () => {
    const anchor = new Date("2026-01-10T00:00:00Z");
    expect(periodKeyFor(anchor, new Date("2026-06-20T00:00:00Z"))).toBe("2026-06");
    expect(periodKeyFor(anchor, new Date("2027-01-09T00:00:00Z"))).toBe("2026-12");
  });

  it("clamps month-end anchors", () => {
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(periodKeyFor(new Date("2026-01-31T00:00:00Z"), new Date("2026-03-01T00:00:00Z"))).toBe(
      "2026-02",
    );
  });

  it("falls back to the calendar month when the anchor is in the future", () => {
    expect(periodKeyFor(new Date("2027-01-01T00:00:00Z"), new Date("2026-11-19T00:00:00Z"))).toBe(
      "2026-11",
    );
  });
});
