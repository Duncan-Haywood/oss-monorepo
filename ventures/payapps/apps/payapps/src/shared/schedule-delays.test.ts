import { describe, expect, it } from "vitest";
import {
  type DelayActivityFacts,
  type DelayReportFacts,
  delayLog,
  delayTotalsText,
  isDelayDay,
  UNTIED_LABEL,
} from "./schedule-delays";

const act = (id: string, number: number, name: string): DelayActivityFacts => ({
  id,
  number,
  name,
  startOn: "2026-11-02",
  finishOn: "2026-11-20",
});

const rep = (
  id: string,
  reportDate: string,
  delayHours: number | null,
  delayActivityId: string | null = null,
  delays: string | null = null,
): DelayReportFacts => ({ id, reportDate, delayHours, delays, weather: null, delayActivityId });

const activities = [act("a2", 2, "Rough-in, level 2"), act("a1", 1, "Underground")];

describe("isDelayDay", () => {
  it("counts hours lost or a named activity, not a zero or blank", () => {
    expect(isDelayDay({ delayHours: 2, delayActivityId: null })).toBe(true);
    expect(isDelayDay({ delayHours: null, delayActivityId: "a1" })).toBe(true);
    expect(isDelayDay({ delayHours: 0, delayActivityId: null })).toBe(false);
    expect(isDelayDay({ delayHours: null, delayActivityId: null })).toBe(false);
  });
});

describe("delayLog", () => {
  const reports = [
    rep("r1", "2026-11-05", 4, "a2", "Waiting on the GC's framer"),
    rep("r2", "2026-11-03", 8, "a2", "Rain"),
    rep("r3", "2026-11-04", 2.5, "a1"),
    rep("r4", "2026-11-06", 3), // untied
    rep("r5", "2026-11-09", 0), // not a delay
    rep("r6", "2026-11-10", null, "a1", "Inspector no-show, hours not known"),
    rep("r7", "2026-11-11", 1, "gone"), // activity deleted since
  ];

  it("groups by activity in number order, untied last, days oldest first", () => {
    const log = delayLog(reports, activities);
    expect(log.groups.map((g) => g.label)).toEqual([
      "A-001 Underground",
      "A-002 Rough-in, level 2",
      UNTIED_LABEL,
    ]);
    const a2 = log.groups[1];
    expect(a2?.days.map((d) => d.reportDate)).toEqual(["2026-11-03", "2026-11-05"]);
    expect(a2?.hours).toBe(12);
    expect(a2?.firstOn).toBe("2026-11-03");
    expect(a2?.lastOn).toBe("2026-11-05");
    expect(a2?.days[1]?.cause).toBe("Waiting on the GC's framer");
  });

  it("counts reports without hours separately and never turns hours into days", () => {
    const log = delayLog(reports, activities);
    const a1 = log.groups[0];
    expect(a1?.dayCount).toBe(2);
    expect(a1?.hours).toBe(2.5);
    expect(a1?.hoursNotStated).toBe(1);
    expect(delayTotalsText(a1 ?? { dayCount: 0, hours: 0, hoursNotStated: 0 })).toBe(
      "2 days, 2.5 h lost, 1 without hours stated",
    );
    expect(log.dayCount).toBe(6);
    expect(log.hours).toBe(18.5);
  });

  it("puts a report whose activity was deleted with the untied ones", () => {
    const untied = delayLog(reports, activities).groups.at(-1);
    expect(untied?.activityId).toBeNull();
    expect(untied?.days.map((d) => d.reportId)).toEqual(["r4", "r7"]);
  });

  it("limits to one activity and a date range", () => {
    const log = delayLog(reports, activities, {
      activityId: "a2",
      from: "2026-11-04",
      to: "2026-11-30",
    });
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0]?.days.map((d) => d.reportId)).toEqual(["r1"]);
    expect(log.dayCount).toBe(1);
    expect(log.hours).toBe(4);
    expect(log.activityId).toBe("a2");
    expect(log.from).toBe("2026-11-04");
  });

  it("is empty with no delays", () => {
    const log = delayLog([rep("x", "2026-11-02", 0)], activities);
    expect(log.groups).toEqual([]);
    expect(log.dayCount).toBe(0);
    expect(delayTotalsText({ dayCount: 1, hours: 8, hoursNotStated: 0 })).toBe("1 day, 8 h lost");
  });
});
