import { describe, expect, it } from "vitest";
import { isCalendarDay, parseTravelerQuery } from "./traveler";

describe("traveler due date", () => {
  it("accepts real days and refuses ones Date.parse would roll over", () => {
    expect(isCalendarDay("2026-02-28")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-1-01")).toBe(false);
  });

  it("is a 400 in the query, not a date in March", () => {
    expect(parseTravelerQuery({ due: "2026-03-02" }).due).toBe("2026-03-02");
    expect(() => parseTravelerQuery({ due: "2026-02-30" })).toThrow();
  });
});
