import { describe, expect, it } from "vitest";
import {
  actByOnOrBefore,
  actByReason,
  federalHolidayOn,
  federalHolidays,
} from "./federal-holidays";
import { federalHolidays as fromSchedule } from "./schedule";

describe("federal holidays for deadlines", () => {
  it("is the same list the job schedule offers", () => {
    for (const y of [2026, 2027, 2028]) expect(fromSchedule(y)).toEqual(federalHolidays(y));
  });
  it("names the observed holiday on a date", () => {
    expect(federalHolidayOn("2026-07-03")).toBe("Independence Day"); // 4 July 2026 is a Saturday
    expect(federalHolidayOn("2026-07-04")).toBeNull();
    expect(federalHolidayOn("2027-12-31")).toBe("New Year's Day"); // 1 January 2028 is a Saturday
    expect(federalHolidayOn("2026-11-26")).toBe("Thanksgiving Day");
  });
  it("steps back past weekends and holidays, listing the holidays it passed", () => {
    expect(actByOnOrBefore("2026-11-24")).toEqual({ on: "2026-11-24", holidays: [] });
    expect(actByOnOrBefore("2026-11-26")).toEqual({
      on: "2026-11-25",
      holidays: ["Thanksgiving Day"],
    });
    expect(actByOnOrBefore("2026-07-05")).toEqual({
      on: "2026-07-02",
      holidays: ["Independence Day"],
    });
    // Christmas 2027 is a Saturday, kept Friday 24 December.
    expect(actByOnOrBefore("2027-12-25")).toEqual({
      on: "2027-12-23",
      holidays: ["Christmas Day"],
    });
  });
  it("says why the date moved", () => {
    expect(actByReason("2026-11-24")).toBeNull();
    expect(actByReason("2026-11-28")).toBe("a weekend");
    expect(actByReason("2026-11-26")).toBe("Thanksgiving Day, a federal holiday");
    expect(actByReason("2026-07-04")).toBe("a weekend, and Independence Day comes just before it");
  });
  it("never moves a date later, on every day of three years", () => {
    let d = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365 * 3; i++, d += 86_400_000) {
      const iso = new Date(d).toISOString().slice(0, 10);
      const { on } = actByOnOrBefore(iso);
      expect(on <= iso).toBe(true);
      const w = new Date(`${on}T00:00:00Z`).getUTCDay();
      expect(w !== 0 && w !== 6 && federalHolidayOn(on) === null).toBe(true);
    }
  });
});
