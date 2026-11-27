import { describe, expect, it } from "vitest";
import { emptyCostInputs } from "./costing";
import {
  addWorkingDays,
  finishDay,
  firstWorkingDay,
  type LeadTime,
  type LoadJob,
  type LoadMachine,
  leadTimes,
  leadTimeText,
  shopLoad,
} from "./shop-load";

// 2026-11-30 is a Monday.
const MON = "2026-11-30";
const mill: LoadMachine = { id: "mill", name: "Haas VF-2", hoursPerDay: 8, active: true };
const lathe: LoadMachine = { id: "lathe", name: "Lathe", hoursPerDay: 16, active: true };
const op = (machineId: string, setupMinutes: number, cycle: number | null) => ({
  machineId,
  label: "",
  setupMinutes,
  cycleMinutesPerPart: cycle,
});

const job = (id: string, dueOn: string | null, lines: LoadJob["lines"], wonOn = "2026-11-20") => ({
  id,
  label: id,
  customer: "Acme",
  dueOn,
  wonOn,
  lines,
});

describe("working days", () => {
  it("starts on the next weekday and skips weekends", () => {
    expect(firstWorkingDay("2026-11-28")).toBe(MON); // Saturday
    expect(firstWorkingDay(MON)).toBe(MON);
    expect(addWorkingDays(MON, 4)).toBe("2026-12-04"); // Friday
    expect(addWorkingDays(MON, 5)).toBe("2026-12-07"); // next Monday
  });

  it("work ending exactly at a day's close finishes that day", () => {
    expect(finishDay(MON, 1)).toEqual({ day: MON, workingDays: 1 });
    expect(finishDay(MON, 1.01)).toEqual({ day: "2026-12-01", workingDays: 2 });
    expect(finishDay(MON, 0)).toEqual({ day: MON, workingDays: 1 });
  });
});

describe("shopLoad", () => {
  it("puts jobs on a machine by due date and flags a late one", () => {
    // A: 60 min setup + 100 × 4.2 min = 480 min = 8 h = 1 mill day, due Wednesday.
    // B: 120 + 50 × 9.6 = 600 min = 10 h = 1.25 days. Both are due Tuesday; B was won first.
    const a = job(
      "A",
      "2026-12-01",
      [{ partNumber: "A-1", starts: 100, operations: [op("mill", 60, 4.2)] }],
      "2026-11-21",
    );
    const b = job("B", "2026-12-01", [
      { partNumber: "B-1", starts: 50, operations: [op("mill", 120, 9.6)] },
    ]);
    const load = shopLoad([a, b], [mill], MON);
    expect(load.jobs.map((j) => j.id)).toEqual(["B", "A"]);
    // B ends at 1.25 days → day 2, Tuesday, on time. A ends at 2.25 → day 3, Wednesday, late.
    expect(load.jobs[0]).toMatchObject({
      finishOn: "2026-12-01",
      workingDays: 2,
      late: false,
      hours: 10,
    });
    expect(load.jobs[1]).toMatchObject({
      finishOn: "2026-12-02",
      workingDays: 3,
      late: true,
      hours: 8,
    });
    expect(load.machines[0]).toMatchObject({
      hours: 18,
      bookedDays: 2.25,
      bookedUntil: "2026-12-02",
      jobs: 2,
    });
  });

  it("waits for the part's previous operation and uses each machine's own hours", () => {
    // Lathe first: 16 h on a 16 h/day lathe = 1 day. Then the mill: 4 h on 8 h/day = 0.5 day,
    // starting when the lathe is done (1.0), so it ends at 1.5 → Tuesday.
    const j = job("J", null, [
      { partNumber: "P", starts: 10, operations: [op("lathe", 0, 96), op("mill", 0, 24)] },
    ]);
    const load = shopLoad([j], [mill, lathe], MON);
    expect(load.jobs[0]).toMatchObject({ finishOn: "2026-12-01", workingDays: 2 });
    const byId = Object.fromEntries(load.machines.map((m) => [m.id, m]));
    expect(byId.lathe).toMatchObject({ hours: 16, bookedDays: 1 });
    expect(byId.mill).toMatchObject({ hours: 4, bookedDays: 1.5 });
  });

  it("runs a job's parts independently", () => {
    const j = job("J", null, [
      { partNumber: "P1", starts: 1, operations: [op("mill", 480, 0)] },
      { partNumber: "P2", starts: 1, operations: [op("lathe", 480, 0)] },
    ]);
    // Mill: 8 h = 1 day; lathe: 8 h on 16 h/day = 0.5 day; both from 0. Job ends at 1.0.
    expect(shopLoad([j], [mill, lathe], MON).jobs[0]).toMatchObject({ workingDays: 1 });
  });

  it("never guesses: no hours per day, a blank cycle or a saved problem leaves the job off the plan", () => {
    const noHours = { ...mill, hoursPerDay: null };
    const j1 = job("J1", null, [{ partNumber: "P", starts: 1, operations: [op("mill", 60, 1)] }]);
    const j2 = job("J2", null, [
      { partNumber: "Q", starts: 1, operations: [op("lathe", 60, null)] },
    ]);
    const j3 = { ...job("J3", null, []), problems: ["Q-1003: enter the quantity ordered"] };
    const load = shopLoad([j1, j2, j3], [noHours, lathe], MON);
    expect(load.jobs.find((j) => j.id === "J1")?.problems).toEqual([
      "Haas VF-2: set its hours per day",
    ]);
    expect(load.jobs.find((j) => j.id === "J2")?.problems).toEqual([
      "Q: an operation with no cycle time",
    ]);
    expect(load.jobs.find((j) => j.id === "J3")?.finishOn).toBeNull();
    // Nothing unplanned takes capacity.
    expect(load.machines.every((m) => m.hours === 0 && m.bookedUntil === null)).toBe(true);
  });

  it("names a machine gone from the rate card", () => {
    const j = job("J", null, [{ partNumber: "P", starts: 1, operations: [op("gone", 0, 1)] }]);
    expect(shopLoad([j], [mill], MON).jobs[0]?.problems).toEqual([
      "P: a machine no longer on the rate card",
    ]);
  });
});

describe("leadTimes", () => {
  it("plans each quantity break behind every open job", () => {
    // Backlog: 2 mill days. The quote: 60 min setup + 4 min/part, at 3% fallout.
    const backlog = job("B", "2026-12-15", [
      { partNumber: "B", starts: 1, operations: [op("mill", 960, 0)] },
    ]);
    const inputs = {
      ...emptyCostInputs([10, 200]),
      falloutBps: 300,
      operations: [op("mill", 60, 4)],
    };
    const [small, big] = leadTimes(inputs, "NEW-1", [backlog], [mill], MON);
    // 10 → 11 starts: 60 + 44 = 104 min = 1.73 h → ends at 2.217 → day 3, Wednesday.
    expect(small).toMatchObject({
      quantity: 10,
      hours: 1.73,
      finishOn: "2026-12-02",
      workingDays: 3,
    });
    // 200 → 207 starts: 60 + 828 = 888 min = 14.8 h = 1.85 days → ends 3.85 → day 4, Thursday.
    expect(big).toMatchObject({ quantity: 200, finishOn: "2026-12-03", workingDays: 4 });
    expect(leadTimeText(big as LeadTime)).toBe("1 week ARO");
    // The backlog's own plan is not moved by asking.
    expect(shopLoad([backlog], [mill], MON).machines[0]?.bookedDays).toBe(2);
  });

  it("says why a quote can't be given a date", () => {
    const inputs = { ...emptyCostInputs([5]), operations: [op("mill", 30, null)] };
    const [lt] = leadTimes(inputs, "NEW-2", [], [mill], MON);
    expect(lt).toMatchObject({
      finishOn: null,
      problems: ["NEW-2: an operation with no cycle time"],
    });
    expect(leadTimeText(lt as LeadTime)).toBeNull();
  });
});
