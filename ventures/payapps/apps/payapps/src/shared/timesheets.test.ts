// Timesheet arithmetic checked against hand sums: the workweek, overtime past 40 falling on the rows
// worked after the 40th hour, wages split onto rows to the cent, burden, and the posting reference.
import { describe, expect, it } from "vitest";
import {
  computeWeek,
  isWeekStart,
  laborCosts,
  laborDescription,
  laborReference,
  overtimePay,
  splitCents,
  weekDates,
  weekEnding,
  weekStartFor,
} from "./timesheets";

const ana = { id: "w1", name: "Ana Ruiz", trade: "Electrician", rateCents: 3_850 };
const ben = { id: "w2", name: "Ben Ito", trade: "Apprentice", rateCents: null };

describe("workweek", () => {
  it("finds the week's first day for any start day", () => {
    // 2026-11-27 is a Friday.
    expect(weekStartFor("2026-11-27", 1)).toBe("2026-11-23");
    expect(weekStartFor("2026-11-27", 0)).toBe("2026-11-22");
    expect(weekStartFor("2026-11-27", 5)).toBe("2026-11-27");
    expect(weekStartFor("2026-11-27", 6)).toBe("2026-11-21");
    expect(isWeekStart("2026-11-23", 1)).toBe(true);
    expect(isWeekStart("2026-11-24", 1)).toBe(false);
    expect(isWeekStart("2026-02-30", 1)).toBe(false);
    expect(weekEnding("2026-12-28")).toBe("2027-01-03");
    expect(weekDates("2026-11-23")).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
  });
});

describe("splitCents", () => {
  it("adds up to the total exactly", () => {
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(0, [0, 0])).toEqual([0, 0]);
    expect(splitCents(1001, [3, 0, 7])).toEqual([300, 0, 701]);
  });
});

describe("computeWeek", () => {
  it("puts the hours past 40 on the rows worked after the 40th hour", () => {
    // Job A Mon-Thu 10 h (40 h), job B Fri 6 h and Sat 4 h: all 10 of job B's hours are overtime.
    const w = computeWeek(
      [ana],
      [
        {
          workerId: "w1",
          projectId: "A",
          sovLineId: "a1",
          hours: [1000, 1000, 1000, 1000, 0, 0, 0],
        },
        { workerId: "w1", projectId: "B", sovLineId: null, hours: [0, 0, 0, 0, 600, 400, 0] },
      ],
    );
    const [a, b] = w.rows;
    expect(a).toMatchObject({ regular: 4000, overtime: 0 });
    expect(b).toMatchObject({ regular: 0, overtime: 1000 });
    // 40 x $38.50 = $1,540.00; 10 x $57.75 = $577.50.
    expect(w.workers[0]).toMatchObject({
      total: 5000,
      regular: 4000,
      overtime: 1000,
      regularPayCents: 154_000,
      overtimePayCents: 57_750,
      grossCents: 211_750,
      byDay: [1000, 1000, 1000, 1000, 600, 400, 0],
      projectIds: ["A", "B"],
    });
    expect(a?.wagesCents).toBe(154_000);
    expect(b?.wagesCents).toBe(57_750);
    expect(w.totals).toEqual({ hours: 5000, regular: 4000, overtime: 1000, grossCents: 211_750 });
  });

  it("splits the day that crosses 40 hours between straight time and overtime", () => {
    // 9 h a day Mon-Thu (36 h); Fri 8 h on two rows in order: 4 h job A then 4 h job B.
    const w = computeWeek(
      [ana],
      [
        { workerId: "w1", projectId: "A", sovLineId: null, hours: [900, 900, 900, 900, 400, 0, 0] },
        { workerId: "w1", projectId: "B", sovLineId: null, hours: [0, 0, 0, 0, 400, 0, 0] },
      ],
    );
    expect(w.rows.map((r) => [r.regular, r.overtime])).toEqual([
      [4000, 0],
      [0, 400],
    ]);
    // 4 x 38.50 x 1.5 = 231.00
    expect(w.rows[1]?.wagesCents).toBe(23_100);
  });

  it("keeps hours with no rate and counts nothing for them", () => {
    const w = computeWeek(
      [ana, ben],
      [{ workerId: "w2", projectId: "A", sovLineId: null, hours: [800, 0, 0, 0, 0, 0, 0] }],
    );
    expect(w.workers.map((x) => x.name)).toEqual(["Ben Ito"]);
    expect(w.workers[0]?.grossCents).toBeNull();
    expect(w.unrated).toEqual(["Ben Ito"]);
    expect(laborCosts(w, 0)).toEqual([]);
  });

  it("flags a day over 24 hours across rows", () => {
    const w = computeWeek(
      [ana],
      [
        { workerId: "w1", projectId: "A", sovLineId: null, hours: [1400, 0, 0, 0, 0, 0, 0] },
        { workerId: "w1", projectId: "B", sovLineId: null, hours: [1100, 0, 0, 0, 0, 0, 0] },
      ],
    );
    expect(w.problems).toEqual(["Ana Ruiz: 25 hours on day 1, more than 24."]);
  });

  it("rounds a quarter-hour of overtime half up to the cent", () => {
    // 0.25 h x $38.50 x 1.5 = $14.4375 -> $14.44
    expect(overtimePay(25, 3_850)).toBe(1_444);
  });
});

describe("laborCosts", () => {
  it("sums wages per job and line and adds the burden", () => {
    const cleo = { id: "w3", name: "Cleo Park", trade: null, rateCents: 2_500 };
    const w = computeWeek(
      [ana, cleo],
      [
        { workerId: "w1", projectId: "A", sovLineId: "a1", hours: [800, 800, 0, 0, 0, 0, 0] },
        { workerId: "w3", projectId: "A", sovLineId: "a1", hours: [800, 0, 0, 0, 0, 0, 0] },
        { workerId: "w3", projectId: "B", sovLineId: null, hours: [0, 800, 0, 0, 0, 0, 0] },
      ],
    );
    // Line a1: 16 x 38.50 = 616.00 + 8 x 25.00 = 200.00 -> 816.00; 30% burden 244.80.
    expect(laborCosts(w, 3_000)).toEqual([
      {
        projectId: "A",
        sovLineId: "a1",
        hours: 2400,
        overtime: 0,
        workers: 2,
        wagesCents: 81_600,
        burdenCents: 24_480,
        amountCents: 106_080,
      },
      {
        projectId: "B",
        sovLineId: null,
        hours: 800,
        overtime: 0,
        workers: 1,
        wagesCents: 20_000,
        burdenCents: 6_000,
        amountCents: 26_000,
      },
    ]);
  });

  it("names the week and line in the reference and the hours in the description", () => {
    expect(laborReference("2026-11-23", "3")).toBe("Timesheet w/e 2026-11-29 item 3");
    expect(laborReference("2026-11-23", null)).toBe("Timesheet w/e 2026-11-29 no line");
    expect(
      laborDescription({ hours: 1050, overtime: 50, workers: 1, wagesCents: 1, burdenCents: 0 }, 0),
    ).toBe("10.5 hours (0.5 overtime), 1 worker, wages");
    expect(
      laborDescription(
        { hours: 800, overtime: 0, workers: 2, wagesCents: 1, burdenCents: 1 },
        2_750,
      ),
    ).toBe("8 hours, 2 workers, wages plus 27.5% burden");
  });
});
