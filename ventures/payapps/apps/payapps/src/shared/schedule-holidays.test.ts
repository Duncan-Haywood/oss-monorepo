// The company's holidays in the workday math. Hand-worked against a calendar: 2026-11-26 is a
// Thursday (Thanksgiving), 2026-11-27 a Friday, 2026-11-30 a Monday, 2026-12-25 a Friday. The
// federal lists are checked against OPM's published 2026 and 2027 holiday tables.
import { describe, expect, it } from "vitest";
import {
  addWorkdays,
  earliestStart,
  federalHolidays,
  holidayCalendar,
  isWorkday,
  lookaheadWindow,
  planShift,
  type ScheduleActivityFacts,
  sequenceProblem,
  summarizeSchedule,
  workdaysBetween,
} from "./schedule";

const act = (over: Partial<ScheduleActivityFacts> & { number: number }): ScheduleActivityFacts => ({
  name: `Activity ${over.number}`,
  trade: null,
  startOn: "2026-11-30",
  finishOn: "2026-12-04",
  percentComplete: 0,
  predecessorNumber: null,
  lagDays: 0,
  ...over,
});

const cal = holidayCalendar([
  { on: "2026-11-26", name: "Thanksgiving Day" },
  { on: "2026-11-27", name: "Day after Thanksgiving" },
  { on: "2026-12-25", name: "Christmas Day" },
  // On a Saturday: changes no workday count.
  { on: "2026-12-26", name: "Boxing Day" },
]);

describe("workdays with the company's holidays", () => {
  it("a holiday is not a workday; without the calendar nothing changes", () => {
    expect(isWorkday("2026-11-26", cal)).toBe(false);
    expect(isWorkday("2026-11-26")).toBe(true);
    expect(isWorkday("2026-11-25", cal)).toBe(true);
  });

  it("adding workdays steps over holidays both ways", () => {
    // Wed 11-25 +1: Thu and Fri are off, the weekend too: Monday 11-30.
    expect(addWorkdays("2026-11-25", 1, cal)).toBe("2026-11-30");
    expect(addWorkdays("2026-11-25", 1)).toBe("2026-11-26");
    // Mon 11-30 -1: back over the weekend and both holidays to Wed 11-25.
    expect(addWorkdays("2026-11-30", -1, cal)).toBe("2026-11-25");
    // Thu 12-24 +1 is Mon 12-28 (Christmas off).
    expect(addWorkdays("2026-12-24", 1, cal)).toBe("2026-12-28");
  });

  it("counts a weekday holiday out of a range and a weekend one not at all", () => {
    // Mon 11-23 to Fri 11-27: five weekdays, two holidays.
    expect(workdaysBetween("2026-11-23", "2026-11-27", cal)).toBe(3);
    expect(workdaysBetween("2026-11-23", "2026-11-27")).toBe(5);
    // Mon 12-21 to Sun 12-27: Christmas out, Boxing Day on a Saturday changes nothing.
    expect(workdaysBetween("2026-12-21", "2026-12-27", cal)).toBe(4);
    // A range of only holidays and weekend.
    expect(workdaysBetween("2026-11-26", "2026-11-29", cal)).toBe(0);
    // The whole-weeks shortcut still agrees with a day-by-day count.
    let n = 0;
    for (let d = "2026-11-02"; d <= "2027-01-29"; d = addWorkdays(d, 1, cal)) n++;
    expect(workdaysBetween("2026-11-02", "2027-01-29", cal)).toBe(n);
  });

  it("the earliest start after a predecessor skips holidays, and the check uses it", () => {
    const pred = act({ number: 1, startOn: "2026-11-23", finishOn: "2026-11-25" });
    const next = act({
      number: 2,
      startOn: "2026-11-26",
      finishOn: "2026-12-02",
      predecessorNumber: 1,
    });
    const byNumber = new Map([
      [1, pred],
      [2, next],
    ]);
    expect(earliestStart(next, byNumber, cal)).toBe("2026-11-30");
    expect(earliestStart(next, byNumber)).toBe("2026-11-26");
    expect(sequenceProblem(next, byNumber)).toBeNull();
    expect(sequenceProblem(next, byNumber, cal)).toContain("earliest 2026-11-30");
  });

  it("a shift moves start and finish by workdays over the holidays", () => {
    const list = [
      act({ number: 1, startOn: "2026-11-23", finishOn: "2026-11-24" }),
      act({ number: 2, startOn: "2026-11-25", finishOn: "2026-11-25", predecessorNumber: 1 }),
    ];
    const plan = planShift(1, 2, list, cal);
    expect(plan.moved).toEqual([
      { number: 1, startOn: "2026-11-25", finishOn: "2026-11-30" },
      { number: 2, startOn: "2026-12-01", finishOn: "2026-12-01" },
    ]);
  });

  it("the lookahead leaves weekday holidays out of its days and lists them", () => {
    const w = lookaheadWindow("2026-11-24", 1, cal);
    expect(w.days).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(w.holidays).toEqual([
      { on: "2026-11-26", name: "Thanksgiving Day" },
      { on: "2026-11-27", name: "Day after Thanksgiving" },
    ]);
    // Boxing Day is a Saturday: not a day column anyway, so not listed.
    expect(lookaheadWindow("2026-12-21", 1, cal).holidays).toEqual([
      { on: "2026-12-25", name: "Christmas Day" },
    ]);
    expect(lookaheadWindow("2026-11-24", 1).holidays).toEqual([]);
  });

  it("weights percent complete by workdays less holidays", () => {
    // A: 11-23..11-27 is 3 workdays with the calendar, B: 11-30..12-04 is 5. A done, B not.
    const list = [
      act({ number: 1, startOn: "2026-11-23", finishOn: "2026-11-27", percentComplete: 100 }),
      act({ number: 2 }),
    ];
    expect(summarizeSchedule(list, "2026-11-24", cal).percentComplete).toBe(37); // 3/8
    expect(summarizeSchedule(list, "2026-11-24").percentComplete).toBe(50);
  });
});

describe("federal holidays", () => {
  it("2026 matches OPM's list (Independence Day on a Saturday kept Friday 07-03)", () => {
    expect(federalHolidays(2026).map((h) => h.on)).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-10-12",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
  });

  it("2027 moves the Saturday and Sunday holidays and takes 2028's New Year's Day", () => {
    const list = federalHolidays(2027);
    expect(list.map((h) => h.on)).toEqual([
      "2027-01-01",
      "2027-01-18",
      "2027-02-15",
      "2027-05-31",
      "2027-06-18",
      "2027-07-05",
      "2027-09-06",
      "2027-10-11",
      "2027-11-11",
      "2027-11-25",
      "2027-12-24",
      "2027-12-31",
    ]);
    expect(list.at(-1)?.name).toBe("New Year's Day");
    // So 2028 does not list it again.
    expect(federalHolidays(2028).some((h) => h.on.endsWith("-01-01"))).toBe(false);
    expect(federalHolidays(2028)).toHaveLength(10);
  });
});
