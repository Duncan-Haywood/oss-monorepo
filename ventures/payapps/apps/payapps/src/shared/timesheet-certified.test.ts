// Crew timesheets into the certified payroll week: hand-made weeks, so the sums can be checked by eye.
import { describe, expect, it } from "vitest";
import type { TimesheetWeekDto } from "./api/types";
import { fillFromTimesheet } from "./certified-payroll-import";
import { payrollDays, rowOvertimeByDay, timesheetCertifiedHours } from "./timesheet-certified";
import { weekDates } from "./timesheets";

function week(
  weekStart: string,
  workers: { id: string; name: string; trade: string | null }[],
  rows: { workerId: string; projectId: string; hours: number[]; overtime: number }[],
): TimesheetWeekDto {
  const days = weekDates(weekStart);
  return {
    weekStart,
    weekEnding: days[6] as string,
    days,
    weekStartDay: 1,
    crew: [],
    jobs: [],
    rows: rows.map((r) => ({
      ...r,
      sovLineId: null,
      regular: r.hours.reduce((a, b) => a + b, 0) - r.overtime,
      wagesCents: null,
    })),
    workers: workers.map((w) => ({
      workerId: w.id,
      name: w.name,
      trade: w.trade,
      rateCents: null,
      byDay: [],
      total: 0,
      regular: 0,
      overtime: 0,
      regularPayCents: null,
      overtimePayCents: null,
      grossCents: null,
      projectIds: [],
    })),
    totals: { hours: 0, regular: 0, overtime: 0, grossCents: 0 },
    unrated: [],
    problems: [],
    labor: [],
    note: "",
  };
}

const ana = { id: "w1", name: "Ana Ruiz", trade: "Electrician" };
const ben = { id: "w2", name: "Ben Q. Ito", trade: null };

describe("rowOvertimeByDay", () => {
  it("puts overtime on the latest hours", () => {
    expect(rowOvertimeByDay([1000, 1000, 0, 600, 400, 0, 0], 700)).toEqual([
      0, 0, 0, 300, 400, 0, 0,
    ]);
    expect(rowOvertimeByDay([800, 0, 0, 0, 0, 0, 0], 0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("timesheetCertifiedHours", () => {
  it("reads one job's straight time and overtime for an aligned week", () => {
    // Mon 2026-11-23 .. Sun 2026-11-29. Ana: 40 h on job A Mon-Thu, 10 h on job B Fri-Sat (overtime).
    // Then 4 h on job A Sat: her row on A has no overtime (B's row carries it in this example).
    const w = week(
      "2026-11-23",
      [ana, ben],
      [
        { workerId: "w1", projectId: "A", hours: [1000, 1000, 1000, 1000, 0, 0, 0], overtime: 0 },
        { workerId: "w1", projectId: "B", hours: [0, 0, 0, 0, 600, 400, 0], overtime: 1000 },
        { workerId: "w2", projectId: "A", hours: [800, 800, 0, 0, 0, 0, 0], overtime: 0 },
      ],
    );
    const h = timesheetCertifiedHours([w], "A", "2026-11-29");
    expect(h.aligned).toBe(true);
    expect(h.entries).toEqual([
      {
        lastName: "Ito",
        firstName: "Ben",
        mi: "Q",
        classification: "",
        st: [800, 800, 0, 0, 0, 0, 0],
        ot: [0, 0, 0, 0, 0, 0, 0],
        rows: 2,
      },
      {
        lastName: "Ruiz",
        firstName: "Ana",
        mi: "",
        classification: "Electrician",
        st: [1000, 1000, 1000, 1000, 0, 0, 0],
        ot: [0, 0, 0, 0, 0, 0, 0],
        rows: 4,
      },
    ]);
    expect(h.otherJobs).toEqual([{ name: "Ana Ruiz", hundredths: 1000 }]);
    expect(h.noTrade).toEqual(["Ben Q. Ito"]);
    // Job B: the overtime lands on Fri and Sat.
    const b = timesheetCertifiedHours([w], "B", "2026-11-29");
    expect(b.entries[0]?.ot).toEqual([0, 0, 0, 0, 600, 400, 0]);
    expect(b.entries[0]?.st).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("reads the two workweeks a payroll week straddles, each day where it falls", () => {
    // Payroll week Sun 2026-11-22 .. Sat 2026-11-28; workweeks start Monday.
    const w1 = week(
      "2026-11-16",
      [ana],
      [{ workerId: "w1", projectId: "A", hours: [0, 0, 0, 0, 0, 0, 500], overtime: 0 }],
    );
    const w2 = week(
      "2026-11-23",
      [ana],
      [
        {
          workerId: "w1",
          projectId: "A",
          hours: [1000, 1000, 1000, 1000, 1000, 300, 800],
          overtime: 1300,
        },
      ],
    );
    expect(payrollDays("2026-11-28")).toEqual(weekDates("2026-11-22"));
    const h = timesheetCertifiedHours([w1, w2], "A", "2026-11-28");
    expect(h.aligned).toBe(false);
    expect(h.workweeksRead).toEqual(["2026-11-22", "2026-11-29"]);
    // Sun 11-22 from the first workweek; Mon..Sat from the second. Of its 1,300 overtime hundredths,
    // 800 fall on Sun 11-29 (outside this payroll week), the other 500 on Sat (300) and Fri (200).
    expect(h.entries[0]?.st).toEqual([500, 1000, 1000, 1000, 1000, 800, 0]);
    expect(h.entries[0]?.ot).toEqual([0, 0, 0, 0, 0, 200, 300]);
  });

  it("fills the form the way a time report does", () => {
    const w = week(
      "2026-11-23",
      [ana],
      [{ workerId: "w1", projectId: "A", hours: [800, 0, 0, 0, 0, 0, 0], overtime: 0 }],
    );
    const h = timesheetCertifiedHours([w], "A", "2026-11-29");
    const blankRow = () => ({
      classification: "",
      st: [0, 0, 0, 0, 0, 0, 0],
      ot: [0, 0, 0, 0, 0, 0, 0],
      grossProjectCents: null,
    });
    const { workers, summary } = fillFromTimesheet([], h.entries, {
      worker: () => ({ lastName: "", firstName: "", rows: [blankRow()] }),
      row: blankRow,
    });
    expect(summary).toMatchObject({ added: 1, matched: 0 });
    expect(workers[0]?.rows[0]).toMatchObject({
      classification: "Electrician",
      st: [800, 0, 0, 0, 0, 0, 0],
    });
  });
});
