// Hand-worked against a calendar: 2026-11-27 is a Friday, 2026-11-30 a Monday, 2026-12-25 a Friday.
import { describe, expect, it } from "vitest";
import {
  activityLabel,
  activityProblem,
  activityStatus,
  addWorkdays,
  type CrewLookaheadInput,
  crewKey,
  crewLookahead,
  earliestStart,
  inLookahead,
  isWorkday,
  lookaheadWindow,
  mondayOf,
  nextActivityNumber,
  planShift,
  predecessorLoop,
  type ScheduleActivityFacts,
  sequenceProblem,
  successorsOf,
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

describe("workdays", () => {
  it("knows weekends", () => {
    expect(isWorkday("2026-11-27")).toBe(true); // Friday
    expect(isWorkday("2026-11-28")).toBe(false); // Saturday
    expect(isWorkday("2026-11-29")).toBe(false); // Sunday
    expect(isWorkday("2026-11-30")).toBe(true); // Monday
  });

  it("moves by workdays over weekends, both ways", () => {
    expect(addWorkdays("2026-11-27", 1)).toBe("2026-11-30");
    expect(addWorkdays("2026-11-30", -1)).toBe("2026-11-27");
    expect(addWorkdays("2026-11-28", 1)).toBe("2026-11-30");
    expect(addWorkdays("2026-11-30", 5)).toBe("2026-12-07");
    expect(addWorkdays("2026-11-30", 10)).toBe("2026-12-14");
    expect(addWorkdays("2026-12-14", -10)).toBe("2026-11-30");
    expect(addWorkdays("2026-11-28", 0)).toBe("2026-11-28");
  });

  it("counts workdays inclusive, across weeks and years", () => {
    expect(workdaysBetween("2026-11-30", "2026-12-04")).toBe(5);
    expect(workdaysBetween("2026-11-30", "2026-11-30")).toBe(1);
    expect(workdaysBetween("2026-11-28", "2026-11-29")).toBe(0);
    expect(workdaysBetween("2026-11-27", "2026-11-30")).toBe(2);
    expect(workdaysBetween("2026-12-04", "2026-11-30")).toBe(0);
    // 2026: 365 days from Thursday Jan 1, 52 weeks + 1 day (Thursday Dec 31): 261.
    expect(workdaysBetween("2026-01-01", "2026-12-31")).toBe(261);
    // Agrees with walking day by day.
    for (let n = 0; n < 40; n++) {
      const to = addWorkdays("2026-11-30", n);
      expect(workdaysBetween("2026-11-30", to)).toBe(n + 1);
    }
  });

  it("finds the Monday of the week", () => {
    expect(mondayOf("2026-11-27")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // Sunday ends the week
    expect(mondayOf("2026-11-30")).toBe("2026-11-30");
    expect(mondayOf("2026-01-01")).toBe("2025-12-29");
  });
});

describe("status", () => {
  const today = "2026-12-02";
  it("reads each case from the typed dates and percent", () => {
    expect(activityStatus(act({ number: 1, percentComplete: 100 }), today)).toBe("done");
    expect(
      activityStatus(act({ number: 1, startOn: "2026-12-03", finishOn: "2026-12-04" }), today),
    ).toBe("not_started");
    expect(activityStatus(act({ number: 1, startOn: "2026-12-02" }), today)).toBe("in_progress");
    expect(activityStatus(act({ number: 1, startOn: "2026-11-30" }), today)).toBe("late_start");
    expect(activityStatus(act({ number: 1, percentComplete: 20 }), today)).toBe("in_progress");
    expect(
      activityStatus(
        act({ number: 1, startOn: "2026-11-23", finishOn: "2026-11-27", percentComplete: 80 }),
        today,
      ),
    ).toBe("late_finish");
  });
});

describe("sequence", () => {
  it("starts the workday after the predecessor, plus the lag", () => {
    const pour = act({ number: 1, finishOn: "2026-12-04" }); // Friday
    const by = new Map([[1, pour]]);
    expect(earliestStart(act({ number: 2, predecessorNumber: 1 }), by)).toBe("2026-12-07");
    expect(earliestStart(act({ number: 2, predecessorNumber: 1, lagDays: 3 }), by)).toBe(
      "2026-12-10",
    );
    expect(earliestStart(act({ number: 2 }), by)).toBeNull();
    expect(earliestStart(act({ number: 2, predecessorNumber: 9 }), by)).toBeNull();
  });

  it("names a start before the predecessor finishes, and a missing predecessor", () => {
    const a = act({ number: 1, finishOn: "2026-12-04" });
    const early = act({
      number: 2,
      predecessorNumber: 1,
      startOn: "2026-12-04",
      finishOn: "2026-12-08",
    });
    const ok = act({
      number: 3,
      predecessorNumber: 1,
      startOn: "2026-12-07",
      finishOn: "2026-12-08",
    });
    const lost = act({ number: 4, predecessorNumber: 7 });
    const by = new Map([a, early, ok, lost].map((x) => [x.number, x]));
    expect(sequenceProblem(early, by)).toBe(
      "Starts 2026-12-04, before A-001 finishes (2026-12-04): earliest 2026-12-07",
    );
    expect(sequenceProblem(ok, by)).toBeNull();
    expect(sequenceProblem(lost, by)).toBe("Waits for A-007, which is not on the schedule");
    expect(sequenceProblem(a, by)).toBeNull();
  });

  it("finds a loop through the predecessors", () => {
    const by = new Map(
      [
        act({ number: 1, predecessorNumber: 3 }),
        act({ number: 2, predecessorNumber: 1 }),
        act({ number: 3, predecessorNumber: 2 }),
        act({ number: 4, predecessorNumber: 1 }),
      ].map((x) => [x.number, x]),
    );
    expect(predecessorLoop(1, by)).toEqual([1, 3, 2]);
    expect(predecessorLoop(4, by)).toBeNull();
  });

  it("checks an activity's own fields", () => {
    expect(activityProblem(act({ number: 1, finishOn: "2026-11-29" }))).toMatch(/before the start/);
    expect(activityProblem(act({ number: 1, predecessorNumber: 1 }))).toMatch(/itself/);
    expect(activityProblem(act({ number: 1, percentComplete: 101 }))).toMatch(/0 to 100/);
    expect(activityProblem(act({ number: 1, lagDays: -1 }))).toMatch(/lag/);
    expect(activityProblem(act({ number: 1 }))).toBeNull();
  });
});

describe("shift", () => {
  // 1 -> 2 -> 3, and 1 -> 4 (done); 5 stands alone.
  const acts = [
    act({ number: 1, startOn: "2026-11-30", finishOn: "2026-12-04" }),
    act({ number: 2, predecessorNumber: 1, startOn: "2026-12-07", finishOn: "2026-12-08" }),
    act({ number: 3, predecessorNumber: 2, startOn: "2026-12-09", finishOn: "2026-12-09" }),
    act({
      number: 4,
      predecessorNumber: 1,
      startOn: "2026-12-07",
      finishOn: "2026-12-07",
      percentComplete: 100,
    }),
    act({ number: 5, startOn: "2026-12-01", finishOn: "2026-12-01" }),
  ];

  it("lists successors through the chain", () => {
    expect(successorsOf(1, acts)).toEqual([2, 3, 4]);
    expect(successorsOf(2, acts)).toEqual([3]);
    expect(successorsOf(5, acts)).toEqual([]);
  });

  it("moves the activity and what waits on it by workdays, keeping their length; done ones stay", () => {
    const plan = planShift(1, 5, acts);
    expect(plan.moved).toEqual([
      { number: 1, startOn: "2026-12-07", finishOn: "2026-12-11" },
      { number: 2, startOn: "2026-12-14", finishOn: "2026-12-15" },
      { number: 3, startOn: "2026-12-16", finishOn: "2026-12-16" },
    ]);
    expect(plan.skippedDone).toEqual([4]);
    // Pulled in a day: Monday's start goes to the Friday before.
    expect(planShift(2, -1, acts).moved).toEqual([
      { number: 2, startOn: "2026-12-04", finishOn: "2026-12-07" },
      { number: 3, startOn: "2026-12-08", finishOn: "2026-12-08" },
    ]);
    expect(planShift(9, 5, acts).moved).toEqual([]);
    expect(planShift(1, 0, acts).moved).toEqual([]);
  });

  it("survives a predecessor loop without walking forever", () => {
    const loop = [
      act({ number: 1, predecessorNumber: 2 }),
      act({ number: 2, predecessorNumber: 1 }),
    ];
    expect(successorsOf(1, loop)).toEqual([2]);
    expect(planShift(1, 1, loop).moved.map((m) => m.number)).toEqual([1, 2]);
  });
});

describe("lookahead and summary", () => {
  it("opens on this week's Monday and lists the workdays", () => {
    const w = lookaheadWindow("2026-11-27", 3);
    expect(w).toMatchObject({ from: "2026-11-23", to: "2026-12-13", weeks: 3 });
    expect(w.days).toHaveLength(15);
    expect(w.days[0]).toBe("2026-11-23");
    expect(w.days[14]).toBe("2026-12-11");
    expect(lookaheadWindow("2026-11-27", 99).weeks).toBe(6);
    expect(lookaheadWindow("2026-11-27", 0).weeks).toBe(3);
  });

  it("keeps late work in the lookahead and leaves out done and later work", () => {
    const w = lookaheadWindow("2026-11-27", 3);
    expect(inLookahead(act({ number: 1, startOn: "2026-11-02", finishOn: "2026-11-06" }), w)).toBe(
      true,
    );
    expect(inLookahead(act({ number: 1, startOn: "2026-12-11", finishOn: "2027-01-08" }), w)).toBe(
      true,
    );
    expect(inLookahead(act({ number: 1, startOn: "2026-12-14", finishOn: "2026-12-18" }), w)).toBe(
      false,
    );
    expect(inLookahead(act({ number: 1, percentComplete: 100 }), w)).toBe(false);
  });

  it("weights percent complete by workdays", () => {
    const s = summarizeSchedule(
      [
        // 10 workdays, half done; 2 workdays, not started; 1 workday, done.
        act({ number: 1, startOn: "2026-11-30", finishOn: "2026-12-11", percentComplete: 50 }),
        act({ number: 2, predecessorNumber: 1, startOn: "2026-12-10", finishOn: "2026-12-11" }),
        act({ number: 3, startOn: "2026-11-27", finishOn: "2026-11-27", percentComplete: 100 }),
      ],
      "2026-12-01",
    );
    // (10 * 0.5 + 0 + 1) / 13 = 46.15%
    expect(s).toEqual({
      total: 3,
      notStarted: 1,
      inProgress: 1,
      done: 1,
      late: 0,
      conflicts: 1,
      startOn: "2026-11-27",
      finishOn: "2026-12-11",
      percentComplete: 46,
    });
    expect(summarizeSchedule([], "2026-12-01").percentComplete).toBeNull();
  });

  it("labels and numbers", () => {
    expect(activityLabel(7)).toBe("A-007");
    expect(nextActivityNumber([1, 4, 2])).toBe(5);
    expect(nextActivityNumber([])).toBe(1);
  });
});

describe("crew lookahead", () => {
  // Today Wednesday 2026-12-02; the two-week window is Mon 11-30 to Sun 12-13.
  const today = "2026-12-02";
  const w = lookaheadWindow(today, 2);
  const row = (
    over: Partial<CrewLookaheadInput> & { number: number; projectId: string },
  ): CrewLookaheadInput => ({
    name: `Activity ${over.number}`,
    trade: null,
    startOn: "2026-11-30",
    finishOn: "2026-12-04",
    percentComplete: 0,
    projectName: over.projectId === "p1" ? "Riverside Clinic" : "Oak Street School",
    projectNumber: null,
    isSample: false,
    ...over,
  });

  it("matches a crew's spellings and sorts named crews before the unnamed", () => {
    expect(crewKey("  Crew  A ")).toBe(crewKey("crew a"));
    expect(crewKey(null)).toBe("");
    const groups = crewLookahead(
      [
        row({ number: 1, projectId: "p1", trade: "Electrical crew B" }),
        row({ number: 2, projectId: "p1" }),
        row({ number: 3, projectId: "p2", trade: " electrical  crew a", startOn: "2026-12-01" }),
        row({ number: 4, projectId: "p1", trade: "Electrical Crew A", startOn: "2026-11-30" }),
      ],
      w,
      today,
    );
    expect(groups.map((g) => g.crew)).toEqual(["Electrical Crew A", "Electrical crew B", null]);
    // The first spelling in start order names the crew; its activities are in start order.
    expect(groups[0]?.activities.map((a) => a.number)).toEqual([4, 3]);
    expect(groups[0]?.jobCount).toBe(2);
  });

  it("lists the workdays a crew is on two jobs, counting a late activity to today", () => {
    const groups = crewLookahead(
      [
        // Past its finish (Tue 12-01 < today), not done: on the crew's plate through Wed 12-02.
        row({
          number: 1,
          projectId: "p1",
          trade: "Crew A",
          startOn: "2026-11-24",
          finishOn: "2026-12-01",
          percentComplete: 50,
        }),
        row({
          number: 2,
          projectId: "p2",
          trade: "Crew A",
          startOn: "2026-12-02",
          finishOn: "2026-12-03",
        }),
        // Same job twice the same day is not two places.
        row({
          number: 3,
          projectId: "p2",
          trade: "Crew A",
          startOn: "2026-12-03",
          finishOn: "2026-12-03",
        }),
      ],
      w,
      today,
    );
    const g = groups[0];
    expect(g?.activities[0]).toMatchObject({ status: "late_finish", barEnd: today });
    expect(g?.daysOnSeveralJobs).toEqual([{ day: "2026-12-02", projectIds: ["p1", "p2"] }]);
  });

  it("leaves out done work, work after the window, and never flags the unnamed group", () => {
    const groups = crewLookahead(
      [
        row({ number: 1, projectId: "p1", percentComplete: 100, trade: "Crew A" }),
        row({
          number: 2,
          projectId: "p1",
          trade: "Crew A",
          startOn: "2026-12-14",
          finishOn: "2026-12-18",
        }),
        row({ number: 3, projectId: "p1" }),
        row({ number: 4, projectId: "p2" }),
      ],
      w,
      today,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ crew: null, jobCount: 2, daysOnSeveralJobs: [] });
  });

  it("is empty with nothing open", () => {
    expect(crewLookahead([], w, today)).toEqual([]);
  });
});
