// A company with more jobs than D1 binds parameters in one statement (100): every read that lists
// something per job (the getting-started checklist, the timesheet week, the weekly digest's daily
// report gaps) goes through src/worker/db/in-chunks.ts. Before it, each of these answered 500 once
// a company passed ~98 jobs.
import { env } from "cloudflare:workers";
import type { TimesheetWeekDto } from "@shared/api/types";
import { addDays } from "@shared/daily-reports";
import type { GettingStarted } from "@shared/getting-started";
import { createAppContext } from "@worker/context";
import { chunks } from "@worker/db/in-chunks";
import { dailyReports, projects, sovLines } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { companyDailyReportJobs } from "@worker/services/payapps/daily-reports";
import { describe, expect, it } from "vitest";
import { call, grantPlan, setupTenant, testDb } from "./helpers";

const JOBS = 120;

/** `JOBS` active jobs, one schedule line each, inserted in batches under D1's parameter cap. */
async function bigCompany() {
  const t = await setupTenant("owner");
  await grantPlan(t.orgId, "crew", "active");
  const jobs = Array.from({ length: JOBS }, (_, i) => ({
    id: newId("prj"),
    orgId: t.orgId,
    name: `Job ${String(i).padStart(3, "0")}`,
    gcName: "Copper State Builders",
    originalContractSumCents: 1_000_000,
  }));
  for (const slice of chunks(jobs, 5)) await testDb().insert(projects).values(slice);
  const lines = jobs.map((j) => ({
    id: newId("sov"),
    orgId: t.orgId,
    projectId: j.id,
    itemNumber: "1",
    description: "Labor",
    originalCents: 1_000_000,
    sortOrder: 0,
  }));
  for (const slice of chunks(lines, 5)) await testDb().insert(sovLines).values(slice);
  return { ...t, jobs, org: `/api/orgs/${t.orgId}` };
}

describe(`a company with ${JOBS} jobs`, () => {
  it("gets its getting-started checklist", async () => {
    const c = await bigCompany();
    const g = await call<GettingStarted>(`${c.org}/getting-started`, { as: c.userId });
    expect(g.requiredTotal).toBeGreaterThan(0);
  });

  it("opens a timesheet week listing every active job with its lines", async () => {
    const c = await bigCompany();
    const week = await call<TimesheetWeekDto>(`${c.org}/timesheets/weeks/2026-11-23`, {
      as: c.userId,
    });
    expect(week.jobs).toHaveLength(JOBS);
    expect(week.jobs.every((j) => j.lines.length === 1)).toBe(true);
  });

  it("lists every job's recent daily reports for the weekly digest", async () => {
    const c = await bigCompany();
    const ctx = createAppContext(env, { now: () => new Date("2026-11-25T13:00:00Z") });
    const day = addDays("2026-11-25", -2);
    const reports = c.jobs.map((j) => ({
      id: newId("dly"),
      orgId: c.orgId,
      projectId: j.id,
      reportDate: day,
      crew: [],
    }));
    for (const slice of chunks(reports, 5)) await testDb().insert(dailyReports).values(slice);
    const jobs = await companyDailyReportJobs(ctx, c.orgId);
    expect(jobs).toHaveLength(JOBS);
    expect(jobs.every((j) => j.firstReportDate === day)).toBe(true);
  });
});

describe("chunks", () => {
  it("splits a list into slices of at most the size, and an empty list into none", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 90)).toEqual([]);
    expect(chunks(Array.from({ length: 180 }, (_, i) => i)).map((s) => s.length)).toEqual([90, 90]);
  });
});
