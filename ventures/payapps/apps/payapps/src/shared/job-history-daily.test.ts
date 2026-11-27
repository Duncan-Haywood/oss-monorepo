// The job history rows for daily report changes (dailyReportEvents in ./job-history.ts) and the
// sentences they read as.
import { describe, expect, it } from "vitest";
import { type DailyReportHistoryFacts, dailyReportEvents, describeJobEvent } from "./job-history";

const report = (over: Partial<DailyReportHistoryFacts> = {}): DailyReportHistoryFacts => ({
  reportDate: "2026-11-23",
  weather: "Clear",
  tempHighF: 61,
  tempLowF: 44,
  delayHours: null,
  crew: [{ company: null, trade: "Electricians", workers: 4, hoursEach: 7.5 }],
  workPerformed: "Boxes on level 2",
  delays: null,
  equipment: null,
  deliveries: null,
  visitors: null,
  safety: null,
  notes: null,
  workers: 4,
  manHours: 30,
  ...over,
});

const texts = (before: DailyReportHistoryFacts | null, after: DailyReportHistoryFacts | null) =>
  dailyReportEvents(before, after).map((e) => describeJobEvent(e.action, e.data));

describe("dailyReportEvents", () => {
  it("a new report names the day and the crew, if any", () => {
    expect(texts(null, report())).toEqual([
      "Daily report for 2026-11-23 entered (4 workers, 30 man-hours)",
    ]);
    expect(texts(null, report({ crew: [], workers: 0, manHours: 0 }))).toEqual([
      "Daily report for 2026-11-23 entered",
    ]);
    expect(texts(null, report({ workers: 1, manHours: 7.25 }))).toEqual([
      "Daily report for 2026-11-23 entered (1 worker, 7.25 man-hours)",
    ]);
  });

  it("an edit names the fields it touched, and a moved date both dates", () => {
    expect(texts(report(), report({ delayHours: 2, delays: "Rain" }))).toEqual([
      "Daily report for 2026-11-23 changed: hours lost, delays",
    ]);
    expect(
      texts(
        report(),
        report({
          reportDate: "2026-11-24",
          crew: [{ company: null, trade: "Electricians", workers: 5, hoursEach: 7.5 }],
        }),
      ),
    ).toEqual([
      "Daily report for 2026-11-24 changed: date changed from 2026-11-23 to 2026-11-24, crew",
    ]);
  });

  it("no change writes nothing; a delete names the day", () => {
    expect(dailyReportEvents(report(), report())).toEqual([]);
    expect(dailyReportEvents(null, null)).toEqual([]);
    expect(texts(report(), null)).toEqual(["Daily report for 2026-11-23 deleted"]);
  });

  it("files read as attached and removed", () => {
    expect(
      describeJobEvent("daily_report_file_added", { reportDate: "2026-11-23", fileName: "a.jpg" }),
    ).toBe("Daily report for 2026-11-23: file attached, a.jpg");
    expect(
      describeJobEvent("daily_report_file_deleted", {
        reportDate: "2026-11-23",
        fileName: "a.jpg",
      }),
    ).toBe("Daily report for 2026-11-23: file removed, a.jpg");
  });
});
