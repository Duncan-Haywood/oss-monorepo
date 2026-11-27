import { describe, expect, it } from "vitest";
import {
  type CompanyDailyReportJob,
  crewTotals,
  type DailyReportGap,
  dailyReportGaps,
  dailyReportGapText,
  dailyReportProblem,
  dayLabel,
  draftFromPrevious,
  hoursText,
  missingWeekdays,
  suggestedReportDate,
  summarizeDailyReports,
  weatherText,
} from "./daily-reports";
import { holidayCalendar } from "./schedule";

const base = {
  reportDate: "2026-11-24",
  tempHighF: null,
  tempLowF: null,
  delayHours: null,
  crew: [],
};
const crew = (workers: number, hoursEach: number, trade = "Electricians") => ({
  company: null,
  trade,
  workers,
  hoursEach,
});

describe("crewTotals", () => {
  it("adds workers and man-hours, to two decimals", () => {
    expect(crewTotals([crew(4, 8), crew(1, 6.5), crew(3, 7.25)])).toEqual({
      workers: 8,
      manHours: 60.25,
    });
    expect(crewTotals([])).toEqual({ workers: 0, manHours: 0 });
  });
});

describe("dailyReportProblem", () => {
  const latest = "2026-11-25";
  it("accepts a plain report and one dated the latest day", () => {
    expect(dailyReportProblem(base, latest)).toBeNull();
    expect(dailyReportProblem({ ...base, reportDate: latest }, latest)).toBeNull();
  });
  it("names the first problem", () => {
    expect(dailyReportProblem({ ...base, reportDate: "2026-11-26" }, latest)).toMatch(
      /after today/,
    );
    expect(dailyReportProblem({ ...base, reportDate: "2026-11-31" }, latest)).toMatch(/YYYY-MM-DD/);
    expect(dailyReportProblem({ ...base, tempHighF: 30, tempLowF: 31 }, latest)).toMatch(/above/);
    expect(dailyReportProblem({ ...base, tempHighF: 150 }, latest)).toMatch(/High temperature/);
    expect(dailyReportProblem({ ...base, tempLowF: 1.5 }, latest)).toMatch(/Low temperature/);
    expect(dailyReportProblem({ ...base, delayHours: 25 }, latest)).toMatch(/Hours lost/);
    expect(dailyReportProblem({ ...base, delayHours: 1.2 }, latest)).toMatch(/quarter/);
    expect(dailyReportProblem({ ...base, crew: [crew(0, 8)] }, latest)).toMatch(
      /Crew line 1.*workers/,
    );
    expect(dailyReportProblem({ ...base, crew: [crew(2, 8), crew(2, 8, " ")] }, latest)).toMatch(
      /Crew line 2: enter the trade/,
    );
    expect(dailyReportProblem({ ...base, crew: [crew(2, 8.1)] }, latest)).toMatch(/hours each/);
  });
  it("allows freezing lows and zero hours lost", () => {
    expect(
      dailyReportProblem({ ...base, tempHighF: 20, tempLowF: -5, delayHours: 0 }, latest),
    ).toBeNull();
  });
});

describe("weatherText", () => {
  it("joins what was typed", () => {
    const r = { weather: "Clear", tempHighF: 61, tempLowF: 44 };
    expect(weatherText(r)).toBe("Clear, 61°/44°F");
    expect(weatherText(r, { ascii: true })).toBe("Clear, 61/44 F");
    expect(weatherText({ weather: null, tempHighF: 61, tempLowF: null })).toBe("high 61°F");
    expect(weatherText({ weather: " ", tempHighF: null, tempLowF: null })).toBe("");
  });
});

describe("missingWeekdays", () => {
  it("lists weekdays from the first report with none, newest first, weekends left out", () => {
    // Mon 2026-11-16 .. Fri 2026-11-27; reports Mon 16, Wed 18, Sat 21 (a Saturday counts as filed).
    const r = missingWeekdays(["2026-11-16", "2026-11-18", "2026-11-21"], "2026-11-24");
    expect(r.days).toEqual(["2026-11-24", "2026-11-23", "2026-11-20", "2026-11-19", "2026-11-17"]);
    expect(r.total).toBe(5);
  });
  it("is empty with no reports and caps the list, not the count", () => {
    expect(missingWeekdays([], "2026-11-24")).toEqual({ days: [], total: 0, holidays: [] });
    const r = missingWeekdays(["2026-09-01"], "2026-11-24", 3);
    expect(r.days).toHaveLength(3);
    expect(r.total).toBeGreaterThan(50);
  });
  it("leaves out the company's holidays and names them, but a report on one still counts", () => {
    // Thanksgiving Thursday 2026-11-26 and the Friday after; reports Mon 23 and Fri 27 (worked).
    const holidays = holidayCalendar([
      { on: "2026-11-26", name: "Thanksgiving Day" },
      { on: "2026-11-27", name: "Day after Thanksgiving" },
      { on: "2026-11-28", name: "A Saturday, listed by mistake" },
    ]);
    const r = missingWeekdays(["2026-11-23", "2026-11-27"], "2026-11-30", 31, holidays);
    expect(r.days).toEqual(["2026-11-30", "2026-11-25", "2026-11-24"]);
    expect(r.total).toBe(3);
    // The Friday has a report and the Saturday is a weekend: only Thursday was left out.
    expect(r.holidays).toEqual([{ on: "2026-11-26", name: "Thanksgiving Day" }]);
    // Without the calendar the Thursday is missing, as before company holidays existed.
    expect(missingWeekdays(["2026-11-23", "2026-11-27"], "2026-11-30").total).toBe(4);
  });
  it("names no holiday before the first report or after the end", () => {
    const holidays = holidayCalendar([
      { on: "2026-11-11", name: "Veterans Day" },
      { on: "2026-12-25", name: "Christmas Day" },
    ]);
    expect(missingWeekdays(["2026-11-16"], "2026-11-20", 31, holidays).holidays).toEqual([]);
  });
});

describe("summarizeDailyReports", () => {
  it("totals man-hours and delay days, and counts missing days through yesterday", () => {
    const s = summarizeDailyReports(
      [
        { reportDate: "2026-11-23", crew: [crew(4, 8)], delayHours: 0 },
        { reportDate: "2026-11-25", crew: [crew(2, 4)], delayHours: 4 },
      ],
      "2026-11-26",
    );
    expect(s).toMatchObject({
      reports: 2,
      firstDate: "2026-11-23",
      lastDate: "2026-11-25",
      manHours: 40,
      delayDays: 1,
      delayHours: 4,
    });
    // Tuesday 24 is missing; today (Thursday 26) is not counted yet.
    expect(s.missing).toEqual({ days: ["2026-11-24"], total: 1, holidays: [] });
  });
  it("skips the company's holidays in the missing days", () => {
    const s = summarizeDailyReports(
      [
        { reportDate: "2026-11-23", crew: [crew(4, 8)], delayHours: 0 },
        { reportDate: "2026-11-25", crew: [crew(2, 4)], delayHours: 0 },
      ],
      "2026-11-26",
      holidayCalendar([{ on: "2026-11-24", name: "Shop day" }]),
    );
    expect(s.missing).toEqual({
      days: [],
      total: 0,
      holidays: [{ on: "2026-11-24", name: "Shop day" }],
    });
  });
});

describe("suggestedReportDate", () => {
  it("is today, or the newest weekday without a report once today is written", () => {
    expect(suggestedReportDate([], "2026-11-26")).toBe("2026-11-26");
    expect(suggestedReportDate(["2026-11-23", "2026-11-26"], "2026-11-26")).toBe("2026-11-25");
    expect(suggestedReportDate(["2026-11-26"], "2026-11-26")).toBe("2026-11-26");
  });
  it("passes over a company holiday to the weekday before it", () => {
    const holidays = holidayCalendar([{ on: "2026-11-26", name: "Thanksgiving Day" }]);
    // Friday 27 written; Thursday 26 is the holiday, so Wednesday 25 is the day to write.
    expect(suggestedReportDate(["2026-11-23", "2026-11-27"], "2026-11-27", holidays)).toBe(
      "2026-11-25",
    );
  });
});

describe("draftFromPrevious", () => {
  it("copies the crew and equipment, not the day's events", () => {
    const prev = { crew: [crew(4, 8)], equipment: "Scissor lift" };
    const d = draftFromPrevious(prev);
    expect(d).toEqual(prev);
    expect(d.crew[0]).not.toBe(prev.crew[0]);
  });
});

describe("labels", () => {
  it("names the day and prints hours without trailing zeros", () => {
    expect(dayLabel("2026-11-24")).toBe("Tuesday 2026-11-24");
    expect(hoursText(8)).toBe("8");
    expect(hoursText(7.25)).toBe("7.25");
  });
});

describe("dailyReportGaps (the weekly email's line)", () => {
  // The email goes out Monday 2026-11-23: the window is Monday 16 to Sunday 22.
  const asOf = "2026-11-23";
  const job = (o: Partial<CompanyDailyReportJob>): CompanyDailyReportJob => ({
    projectId: "p1",
    projectName: "Clinic TI",
    projectNumber: "2207",
    gcName: "Harbor Builders",
    firstReportDate: "2026-11-02",
    reportDates: [],
    ...o,
  });

  it("lists last week's weekdays with no report, oldest first, and never the weekend", () => {
    const gaps = dailyReportGaps(
      [job({ reportDates: ["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-21"] })],
      asOf,
    );
    expect(gaps).toEqual([
      {
        projectId: "p1",
        projectName: "Clinic TI",
        projectNumber: "2207",
        gcName: "Harbor Builders",
        days: ["2026-11-18", "2026-11-20"],
        lastReportDate: "2026-11-21",
      },
    ]);
    expect(dailyReportGapText(gaps[0] as DailyReportGap)).toBe(
      "Clinic TI (#2207), Harbor Builders: no report for Wednesday 2026-11-18 and Friday 2026-11-20.",
    );
  });

  it("counts no day before the job's first report, and not the email's own day", () => {
    const started = job({
      firstReportDate: "2026-11-18",
      reportDates: ["2026-11-18", "2026-11-19"],
    });
    expect(dailyReportGaps([started], asOf).map((g) => g.days)).toEqual([["2026-11-20"]]);
    // Only today's report: the job just started, nothing is missing yet.
    const today = job({ firstReportDate: asOf, reportDates: [asOf] });
    expect(dailyReportGaps([today], asOf)).toEqual([]);
    // A complete week lists nothing.
    const full = job({
      reportDates: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"],
    });
    expect(dailyReportGaps([full], asOf)).toEqual([]);
  });

  it("leaves out the company's holidays", () => {
    const j = job({ reportDates: ["2026-11-16", "2026-11-17", "2026-11-19"] });
    const holidays = holidayCalendar([{ on: "2026-11-18", name: "Shop day" }]);
    expect(dailyReportGaps([j], asOf, holidays).map((g) => g.days)).toEqual([["2026-11-20"]]);
    expect(dailyReportGaps([j], asOf).map((g) => g.days)).toEqual([["2026-11-18", "2026-11-20"]]);
    // Every missing day a holiday: the job is not listed at all.
    const all = holidayCalendar([
      { on: "2026-11-18", name: "Shop day" },
      { on: "2026-11-20", name: "Shop day" },
    ]);
    expect(dailyReportGaps([j], asOf, all)).toEqual([]);
  });

  it("leaves out a job whose log stopped more than 14 days ago", () => {
    expect(dailyReportGaps([job({ reportDates: ["2026-11-08"] })], asOf)).toEqual([]);
    const kept = dailyReportGaps([job({ reportDates: ["2026-11-09"] })], asOf);
    expect(kept.map((g) => g.days)).toEqual([
      ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"],
    ]);
    // A report dated after the email's day (filed early, west of UTC) is not the log's last day.
    expect(dailyReportGaps([job({ reportDates: ["2026-11-24"] })], asOf)).toEqual([]);
  });

  it("puts the jobs with the most missing days first, then by name", () => {
    const gaps = dailyReportGaps(
      [
        job({ projectId: "a", projectName: "Bravo", reportDates: ["2026-11-16", "2026-11-17"] }),
        job({ projectId: "b", projectName: "Alpha", reportDates: ["2026-11-16", "2026-11-17"] }),
        job({ projectId: "c", projectName: "Zulu", reportDates: ["2026-11-16"] }),
      ],
      asOf,
    );
    expect(gaps.map((g) => g.projectName)).toEqual(["Zulu", "Alpha", "Bravo"]);
    const [zulu] = gaps;
    if (!zulu) throw new Error("no gap");
    expect(dailyReportGapText({ ...zulu, projectNumber: null, days: ["2026-11-20"] })).toBe(
      "Zulu, Harbor Builders: no report for Friday 2026-11-20.",
    );
  });
});
