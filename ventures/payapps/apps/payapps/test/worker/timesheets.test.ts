// Crew timesheets (/timesheets): the crew list, a week's hours replaced per worker, overtime past 40,
// the week posted to each job's labor costs once (posting again adds nothing), the CSVs, the plan gate
// on posting, the workweek fixed once hours exist, viewers read-only, and another company kept apart.
import type {
  CrewDto,
  JobCostDto,
  ProjectDetailDto,
  ProjectDto,
  TimesheetPostDto,
  TimesheetWeekDto,
} from "@shared/api/types";
import {
  guessTimesheetColumns,
  readTimesheetReport,
  timesheetHours,
} from "@shared/certified-payroll-import";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const WEEK = "2026-11-23"; // a Monday

async function company(plan: string | null = "crew") {
  const t = await setupTenant("owner");
  if (plan) await grantPlan(t.orgId, plan, "active");
  const as = t.userId;
  const org = `/api/orgs/${t.orgId}`;
  const job = async (name: string) => {
    const p = await call<ProjectDto>(`${org}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name, gcName: "Copper State Builders", originalContractSumCents: 10_000_000 },
    });
    const d = await call<ProjectDetailDto>(`${org}/projects/${p.id}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        lines: [
          { itemNumber: "1", description: "Rough-in", originalCents: 6_000_000 },
          { itemNumber: "2", description: "Trim", originalCents: 4_000_000 },
        ],
      },
    });
    return { id: p.id, lines: d.sovLines.map((l) => l.id) as [string, string] };
  };
  return { ...t, as, org, ts: `${org}/timesheets`, job };
}

async function worker(ts: string, as: string, name: string, rateCents: number | null) {
  const crew = await call<CrewDto>(`${ts}/crew`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, trade: "Electrician", rateCents },
  });
  const m = crew.members.find((x) => x.name === name);
  if (!m) throw new Error("worker not added");
  return m.id;
}

describe("crew timesheets", () => {
  it("keeps the crew list: one worker per name, deactivated rather than deleted once they have hours", async () => {
    const { ts, as, job } = await company();
    const a = await job("Mesa Clinic TI");
    const ana = await worker(ts, as, "Ana Ruiz", 3_850);
    await call(`${ts}/crew`, { method: "POST", as, expect: 409, json: { name: " ana  RUIZ " } });
    const ben = await worker(ts, as, "Ben Ito", null);
    // No hours: deleted.
    let crew = await call<CrewDto>(`${ts}/crew/${ben}`, { method: "DELETE", as });
    expect(crew.members.map((m) => m.name)).toEqual(["Ana Ruiz"]);
    expect(crew.weekStartDay).toBe(1);
    await call(`${ts}/weeks/${WEEK}/workers/${ana}`, {
      method: "PUT",
      as,
      json: { rows: [{ projectId: a.id, sovLineId: a.lines[0], hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });
    await call(`${ts}/crew/${ana}`, { method: "DELETE", as, expect: 409 });
    crew = await call<CrewDto>(`${ts}/crew/${ana}`, {
      method: "PATCH",
      as,
      json: { active: false },
    });
    expect(crew.members[0]).toMatchObject({ active: false, hasHours: true });
    // Inactive: no new hours.
    await call(`${ts}/weeks/2026-11-30/workers/${ana}`, {
      method: "PUT",
      as,
      expect: 400,
      json: { rows: [{ projectId: a.id, hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });
    // The workweek is fixed once hours exist.
    expect(crew.weekStartLocked).toBe(true);
    await call(`${ts}/settings`, { method: "PUT", as, expect: 409, json: { weekStartDay: 0 } });
    await call(`${ts}/settings`, { method: "PUT", as, json: { weekStartDay: 1 } });
  });

  it("totals a week with overtime past 40 and posts it to each job's labor costs once", async () => {
    const { ts, as, org, job } = await company();
    const a = await job("Mesa Clinic TI");
    const b = await job("Tempe Library");
    const ana = await worker(ts, as, "Ana Ruiz", 3_850);
    const cleo = await worker(ts, as, "Cleo Park", 2_500);

    // Not a Monday: refused.
    await call(`${ts}/weeks/2026-11-24`, { as, expect: 400 });

    // Ana: 40 h on job A line 1 Mon-Thu, then 10 h on job B Fri-Sat (all overtime).
    await call(`${ts}/weeks/${WEEK}/workers/${ana}`, {
      method: "PUT",
      as,
      json: {
        rows: [
          { projectId: a.id, sovLineId: a.lines[0], hours: [1000, 1000, 1000, 1000, 0, 0, 0] },
          { projectId: b.id, sovLineId: null, hours: [0, 0, 0, 0, 600, 400, 0] },
          { projectId: b.id, sovLineId: null, hours: [0, 0, 0, 0, 0, 0, 0] },
        ],
      },
    });
    // Cleo: 8 h on job A line 1.
    const w = await call<TimesheetWeekDto>(`${ts}/weeks/${WEEK}/workers/${cleo}`, {
      method: "PUT",
      as,
      json: { rows: [{ projectId: a.id, sovLineId: a.lines[0], hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });
    expect(w.weekEnding).toBe("2026-11-29");
    expect(w.rows).toHaveLength(3); // the empty row is dropped
    expect(w.workers.find((x) => x.name === "Ana Ruiz")).toMatchObject({
      regular: 4000,
      overtime: 1000,
      grossCents: 211_750,
    });
    expect(w.totals).toMatchObject({ hours: 5800, overtime: 1000, grossCents: 231_750 });
    // Job A line 1: 1,540.00 + 200.00; job B no line: 577.50. Nothing posted yet.
    expect(w.labor.map((l) => [l.projectName, l.itemNumber, l.wagesCents, l.postedCents])).toEqual([
      ["Mesa Clinic TI", "1", 174_000, null],
      ["Tempe Library", null, 57_750, null],
    ]);

    // A day over 24 hours is refused.
    await call(`${ts}/weeks/${WEEK}/workers/${cleo}`, {
      method: "PUT",
      as,
      expect: 400,
      json: {
        rows: [
          { projectId: a.id, hours: [1300, 0, 0, 0, 0, 0, 0] },
          { projectId: b.id, hours: [1200, 0, 0, 0, 0, 0, 0] },
        ],
      },
    });
    // A line from another job is refused.
    await call(`${ts}/weeks/${WEEK}/workers/${cleo}`, {
      method: "PUT",
      as,
      expect: 400,
      json: { rows: [{ projectId: b.id, sovLineId: a.lines[0], hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });

    // Post with 30% burden.
    const posted = await call<TimesheetPostDto>(`${ts}/weeks/${WEEK}/post`, {
      method: "POST",
      as,
      json: { burdenBps: 3_000 },
    });
    expect(posted).toMatchObject({ added: 2, skipped: 0 });
    expect(posted.week.labor.map((l) => l.postedCents)).toEqual([226_200, 75_075]);
    const jcA = await call<JobCostDto>(`${org}/projects/${a.id}/job-cost`, { as });
    expect(jcA.entries).toHaveLength(1);
    expect(jcA.entries[0]).toMatchObject({
      category: "labor",
      amountCents: 226_200,
      sovLineId: a.lines[0],
      incurredOn: "2026-11-29",
      vendor: "Timesheets",
      reference: "Timesheet w/e 2026-11-29 item 1",
      description: "48 hours, 2 workers, wages plus 30% burden",
    });
    // Posting again adds nothing.
    const again = await call<TimesheetPostDto>(`${ts}/weeks/${WEEK}/post`, {
      method: "POST",
      as,
      json: { burdenBps: 3_000 },
    });
    expect(again).toMatchObject({ added: 0, skipped: 2 });

    // The CSVs.
    const pay = await (await api(`${ts}/weeks/${WEEK}/payroll.csv`, { as })).text();
    expect(pay.split("\r\n")[2]).toBe(
      "Ana Ruiz,Electrician,40,10,50,38.5,1540,577.5,2117.5,Mesa Clinic TI; Tempe Library",
    );
    const time = await (await api(`${ts}/weeks/${WEEK}/time.csv`, { as })).text();
    expect(time.split("\r\n").slice(0, 2)).toEqual([
      "Work date,Employee,Classification,Job,Job number,Item,Regular hours,Overtime hours",
      "2026-11-23,Ana Ruiz,Electrician,Mesa Clinic TI,,1,10,0",
    ]);
    // The certified payroll import reads the time detail back: Ana on job B, 10 h overtime.
    const report = readTimesheetReport(time);
    if (!report) throw new Error("time CSV not read");
    const read = timesheetHours(report, {
      columns: guessTimesheetColumns(report.headers),
      weekEnding: "2026-11-29",
      jobValues: ["Tempe Library"],
    });
    expect(read.errors).toEqual([]);
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0]?.ot).toEqual([0, 0, 0, 0, 600, 400, 0]);
    expect(read.entries[0]?.st).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("refuses to post hours with no pay rate, and needs job costing to post", async () => {
    const { ts, as, job } = await company(null);
    const a = await job("Mesa Clinic TI");
    const ben = await worker(ts, as, "Ben Ito", null);
    await call(`${ts}/weeks/${WEEK}/workers/${ben}`, {
      method: "PUT",
      as,
      json: { rows: [{ projectId: a.id, hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });
    // Free plan: hours are kept, posting is a paid feature.
    await call(`${ts}/weeks/${WEEK}/post`, { method: "POST", as, expect: 402, json: {} });
    const w = await call<TimesheetWeekDto>(`${ts}/weeks/${WEEK}`, { as });
    expect(w.unrated).toEqual(["Ben Ito"]);
  });

  it("lets viewers read and not write, and keeps companies apart", async () => {
    const { ts, as, orgId, job } = await company();
    const a = await job("Mesa Clinic TI");
    const ana = await worker(ts, as, "Ana Ruiz", 3_850);
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    await call(`${ts}/crew`, { as: viewer.id });
    await call(`${ts}/weeks/${WEEK}`, { as: viewer.id });
    await call(`${ts}/crew`, { method: "POST", as: viewer.id, expect: 403, json: { name: "X" } });
    await call(`${ts}/weeks/${WEEK}/workers/${ana}`, {
      method: "PUT",
      as: viewer.id,
      expect: 403,
      json: { rows: [] },
    });

    const other = await company();
    // Another company's worker and job are not reachable from here.
    await call(`${other.ts}/weeks/${WEEK}/workers/${ana}`, {
      method: "PUT",
      as: other.as,
      expect: 404,
      json: { rows: [] },
    });
    const theirs = await worker(other.ts, other.as, "Dee Long", 3_000);
    await call(`${other.ts}/weeks/${WEEK}/workers/${theirs}`, {
      method: "PUT",
      as: other.as,
      expect: 400,
      json: { rows: [{ projectId: a.id, hours: [800, 0, 0, 0, 0, 0, 0] }] },
    });
    await call(`${ts}/crew`, { as: other.as, expect: 404 });
  });
});
