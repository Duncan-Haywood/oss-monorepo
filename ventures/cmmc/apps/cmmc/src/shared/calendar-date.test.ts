import { describe, expect, it } from "vitest";
import { isCalendarDate } from "./calendar-date";

describe("isCalendarDate (the org routes' date fields)", () => {
  it("accepts real days and refuses impossible ones", () => {
    for (const d of ["2026-01-31", "2028-02-29", "2026-12-31"])
      expect(isCalendarDate(d)).toBe(true);
    for (const d of [
      "2026-13-01",
      "2026-02-29",
      "2026-02-30",
      "2026-04-31",
      "2026-00-01",
      "26-01-01",
      20260101,
    ]) {
      expect(isCalendarDate(d)).toBe(false);
    }
  });
});
