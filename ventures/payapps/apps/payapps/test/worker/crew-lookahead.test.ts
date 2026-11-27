// The crew lookahead across jobs: open activities on every active job grouped by crew, the days a
// crew has work on two jobs, closed jobs and done work left out, the PDF, every member reads it,
// and another company's schedules never appear.
import type { CrewLookaheadDto, ProjectDto } from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { mondayOf } from "@shared/schedule";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
const nextMonday = () => addDays(mondayOf(today()), 7);

async function company() {
  const t = await setupTenant("owner");
  const as = t.userId;
  // More than one active job needs a paid plan, which is when a crew lookahead matters.
  await grantPlan(t.orgId, "crew", "active");
  const job = async (name: string) => {
    const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name, gcName: "Harbor Builders", originalContractSumCents: 5_000_000 },
    });
    const url = `/api/orgs/${t.orgId}/projects/${p.id}/schedule`;
    const add = (json: Record<string, unknown>) =>
      call(url, { method: "POST", as, expect: 201, json });
    return { id: p.id, add };
  };
  return { ...t, as, job, url: `/api/orgs/${t.orgId}/schedule/crews` };
}

describe("crew lookahead", () => {
  it("groups every job's open work by crew and lists the days a crew is on two jobs", async () => {
    const c = await company();
    const empty = await call<CrewLookaheadDto>(c.url, { as: c.as });
    expect(empty).toMatchObject({ groups: [], jobCount: 0, truncated: false });
    expect(empty.lookahead.weeks).toBe(2);
    expect(empty.lookahead.days).toHaveLength(10);

    const mon = nextMonday();
    const clinic = await c.job("Riverside Clinic");
    const school = await c.job("Oak Street School");
    await clinic.add({
      name: "Rough-in level 2",
      trade: "Crew A",
      startOn: mon,
      finishOn: addDays(mon, 2),
    });
    await school.add({
      name: "Pull wire to LP-2",
      trade: " crew  a ",
      startOn: addDays(mon, 2),
      finishOn: addDays(mon, 4),
    });
    await school.add({ name: "Set fixtures", trade: "Crew B", startOn: mon, finishOn: mon });
    await clinic.add({ name: "Walkthrough", startOn: mon, finishOn: mon });
    await clinic.add({
      name: "Already done",
      trade: "Crew A",
      startOn: mon,
      finishOn: mon,
      percentComplete: 100,
    });
    // Four weeks after next Monday is past a two-week lookahead and inside a six-week one.
    await clinic.add({
      name: "Trim out",
      trade: "Crew A",
      startOn: addDays(mon, 28),
      finishOn: addDays(mon, 29),
    });

    const la = await call<CrewLookaheadDto>(c.url, { as: c.as });
    expect(la.jobCount).toBe(2);
    expect(la.groups.map((g) => g.crew)).toEqual(["Crew A", "Crew B", null]);
    const a = la.groups[0];
    expect(a?.activities.map((x) => x.name)).toEqual(["Rough-in level 2", "Pull wire to LP-2"]);
    expect(a?.jobCount).toBe(2);
    expect(a?.daysOnSeveralJobs).toEqual([
      { day: addDays(mon, 2), projectIds: [clinic.id, school.id] },
    ]);
    expect(la.groups[1]?.daysOnSeveralJobs).toEqual([]);

    const six = await call<CrewLookaheadDto>(`${c.url}?weeks=6`, { as: c.as });
    expect(six.groups[0]?.activities.map((x) => x.name)).toContain("Trim out");

    // A closed job drops out.
    await call(`/api/orgs/${c.orgId}/projects/${school.id}`, {
      method: "PATCH",
      as: c.as,
      json: { status: "closed" },
    });
    const after = await call<CrewLookaheadDto>(c.url, { as: c.as });
    expect(after.jobCount).toBe(1);
    expect(after.groups[0]?.daysOnSeveralJobs).toEqual([]);

    const pdf = await api(`${c.url}.pdf`, { as: c.as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("crew-lookahead-2-weeks.pdf");
    const text = new TextDecoder().decode(await pdf.arrayBuffer());
    expect(text).toContain("(2-week crew lookahead) Tj");
    expect(text).toContain("(A-001 Rough-in level 2) Tj");
  });

  it("lets every member read it", async () => {
    const c = await company();
    const viewer = await createTestUser();
    await addToOrg(c.orgId, viewer.id, "viewer");
    expect((await api(c.url, { as: viewer.id })).status).toBe(200);
    expect((await api(`${c.url}.pdf`, { as: viewer.id })).status).toBe(200);
  });

  it("keeps companies apart", async () => {
    const a = await company();
    const b = await company();
    const job = await a.job("Job A");
    await job.add({
      name: "Secret work",
      trade: "Crew A",
      startOn: nextMonday(),
      finishOn: nextMonday(),
    });
    expect((await api(a.url, { as: b.as })).status).toBe(404);
    expect((await api(`${a.url}.pdf`, { as: b.as })).status).toBe(404);
    const own = await call<CrewLookaheadDto>(b.url, { as: b.as });
    expect(own.groups).toEqual([]);
  });
});
