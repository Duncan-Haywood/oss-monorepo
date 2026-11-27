// Date.parse("2026-02-30T00:00:00Z") is not NaN in V8: it rolls over to 2 March. Each reader below
// must refuse an impossible day instead of working from a different one (platform/ci/check_calendar_dates.py
// in the public repository).
import { describe, expect, it } from "vitest";
import { daysBetween } from "./cash-report";
import { workdaysBetween } from "./schedule";
import { xerDay } from "./schedule-xer";
import { datesInLine } from "./submittal-stamp";

describe("impossible calendar days", () => {
  it("xerDay refuses 30 February and 31 April but keeps 29 February in a leap year", () => {
    expect(xerDay("2026-02-30 08:00")).toBeNull();
    expect(xerDay("2026-04-31")).toBeNull();
    expect(xerDay("2028-02-29 08:00")).toBe("2028-02-29");
    expect(xerDay("2026-03-12 08:00")).toBe("2026-03-12");
  });

  it("daysBetween counts no days to or from an impossible day", () => {
    expect(daysBetween("2026-02-27", "2026-02-30")).toBe(0);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("workdaysBetween counts no workdays to or from an impossible day", () => {
    expect(workdaysBetween("2026-02-30", "2026-03-06")).toBe(0);
    expect(workdaysBetween("2026-03-02", "2026-03-06")).toBe(5);
  });

  it("a stamp's 02/30 is not read as a date", () => {
    expect(datesInLine("RECEIVED 02/30/2026")).toEqual([]);
    expect(datesInLine("RECEIVED 02/28/2026")).toEqual(["2026-02-28"]);
  });
});
