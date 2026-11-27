import { describe, expect, it } from "vitest";
import { addHolidaysSchema, isCalendarDate, isoDate, ownerPaidSchema } from "./schemas";

describe("isoDate (every date field in the API)", () => {
  it("accepts real calendar days, leap days included", () => {
    for (const d of ["2026-01-01", "2026-12-31", "2028-02-29", "2026-11-27"]) {
      expect(isCalendarDate(d)).toBe(true);
      expect(isoDate.safeParse(d).success).toBe(true);
    }
  });
  it("refuses a day that does not exist (red team 2026-11-27: 2026-13-01 crashed the cash page)", () => {
    for (const d of [
      "2026-13-01",
      "2026-00-10",
      "2026-02-29",
      "2026-02-31",
      "2026-04-31",
      "2026-09-99",
    ]) {
      expect(isoDate.safeParse(d).success).toBe(false);
    }
    expect(isoDate.safeParse("2026-1-01").success).toBe(false);
  });
  it("applies to the schemas built on it", () => {
    expect(ownerPaidSchema.safeParse({ ownerPaidOn: "2026-13-01" }).success).toBe(false);
    expect(ownerPaidSchema.safeParse({ ownerPaidOn: null }).success).toBe(true);
    expect(
      addHolidaysSchema.safeParse({ holidays: [{ on: "2026-02-30", name: "x" }] }).success,
    ).toBe(false);
  });
});
