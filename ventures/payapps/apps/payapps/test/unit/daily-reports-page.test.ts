// The daily reports page's form (src/client/pages/daily-reports.tsx): the request body, blank crew
// rows dropped, numbers read, problems in words, and a report started from the latest one.
import type { DailyReportDto } from "@shared/api/types";
import { expect, it } from "vitest";
import {
  dailyFormOf,
  dailyReportBody,
  emptyDailyForm,
  formFromPrevious,
} from "../../src/client/pages/daily-reports";

const latest = "2026-11-27";

it("builds the body: trims text, drops blank crew rows, reads numbers", () => {
  const f = {
    ...emptyDailyForm("2026-11-24"),
    weather: " Rain after 1 pm ",
    tempHighF: "52",
    tempLowF: "",
    delayHours: "2.5",
    crew: [
      { company: "", trade: " Electricians ", workers: "4", hoursEach: "8" },
      { company: "", trade: "", workers: "", hoursEach: "8" },
    ],
    workPerformed: "Feeders to L1",
  };
  expect(dailyReportBody(f, latest)).toEqual({
    reportDate: "2026-11-24",
    weather: "Rain after 1 pm",
    tempHighF: 52,
    tempLowF: null,
    delayHours: 2.5,
    delayActivityId: null,
    crew: [{ company: null, trade: "Electricians", workers: 4, hoursEach: 8 }],
    workPerformed: "Feeders to L1",
    delays: null,
    equipment: null,
    deliveries: null,
    visitors: null,
    safety: null,
    notes: null,
  });
});

it("throws the first problem in words", () => {
  const f = emptyDailyForm("2026-11-24");
  expect(() => dailyReportBody({ ...f, tempHighF: "warm" }, latest)).toThrow(/High temperature/);
  expect(() =>
    dailyReportBody(
      { ...f, crew: [{ company: "Acme", trade: "", workers: "2", hoursEach: "8" }] },
      latest,
    ),
  ).toThrow(/Crew line 1: enter the trade/);
  expect(() => dailyReportBody({ ...f, reportDate: "2026-12-01" }, latest)).toThrow(/after today/);
});

const saved: DailyReportDto = {
  id: "dly_1",
  reportDate: "2026-11-23",
  weather: "Clear",
  tempHighF: 61,
  tempLowF: 44,
  delayHours: null,
  delayActivityId: null,
  delayActivityLabel: null,
  crew: [{ company: null, trade: "Electricians", workers: 4, hoursEach: 7.5 }],
  workPerformed: "Boxes on level 2",
  delays: null,
  equipment: "Scissor lift",
  deliveries: null,
  visitors: null,
  safety: null,
  notes: null,
  workers: 4,
  manHours: 30,
  fileCount: 0,
  createdByName: "Test User",
  updatedByName: "Test User",
  createdAt: "2026-11-23T22:00:00.000Z",
  updatedAt: "2026-11-23T22:00:00.000Z",
};

it("round-trips a saved report through the edit form", () => {
  expect(dailyReportBody(dailyFormOf(saved), latest)).toMatchObject({
    reportDate: "2026-11-23",
    tempHighF: 61,
    crew: saved.crew,
    equipment: "Scissor lift",
    delayHours: null,
  });
});

it("starts a new report with yesterday's crew and equipment only", () => {
  const f = formFromPrevious(saved, "2026-11-24");
  expect(f.reportDate).toBe("2026-11-24");
  expect(f.crew).toEqual([{ company: "", trade: "Electricians", workers: "4", hoursEach: "7.5" }]);
  expect(f.equipment).toBe("Scissor lift");
  expect(f.weather).toBe("");
  expect(f.workPerformed).toBe("");
});
