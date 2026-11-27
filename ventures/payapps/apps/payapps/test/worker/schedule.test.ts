// The job's schedule: activities with typed dates and an optional predecessor; the sequence check;
// moving an activity and what waits on it when the GC slips; loops refused; the lookahead PDF and
// the CSV; editors write, viewers read; another company's job and activities answer 404.
import type {
  ProjectDto,
  ScheduleActivityDto,
  ScheduleDto,
  ScheduleShiftDto,
} from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { addWorkdays, mondayOf } from "@shared/schedule";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
/** Next week's Monday: a date that is always ahead and always a workday. */
const nextMonday = () => addDays(mondayOf(today()), 7);

async function job(name = "Riverside Clinic") {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, gcName: "Harbor Builders", originalContractSumCents: 5_000_000 },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  return { ...t, as, base, url: `${base}/schedule`, projectId: created.id };
}

describe("job schedule", () => {
  it("adds activities, flags one that starts before its predecessor finishes, and shifts a chain", async () => {
    const { url, as } = await job();
    const empty = await call<ScheduleDto>(url, { as });
    expect(empty.activities).toEqual([]);
    expect(empty.nextNumber).toBe(1);
    expect(empty.lookahead.days).toHaveLength(15);

    const mon = nextMonday();
    const fri = addDays(mon, 4);
    const roughIn = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Rough-in level 2", trade: "Electrical crew A", startOn: mon, finishOn: fri },
    });
    expect(roughIn).toMatchObject({
      number: 1,
      workdays: 5,
      status: "not_started",
      inLookahead: true,
    });

    // Starts on the Friday the rough-in finishes: flagged, with the earliest start the Monday after.
    const inspect = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Rough-in inspection", startOn: fri, finishOn: fri, predecessorNumber: 1 },
    });
    expect(inspect.number).toBe(2);
    expect(inspect.earliestStart).toBe(addWorkdays(fri, 1));
    expect(inspect.sequenceProblem).toMatch(/before A-001 finishes/);

    const fixed = await call<ScheduleActivityDto>(`${url}/${inspect.id}`, {
      method: "PATCH",
      as,
      json: { startOn: addWorkdays(fri, 1), finishOn: addWorkdays(fri, 1) },
    });
    expect(fixed.sequenceProblem).toBeNull();

    const cover = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Cover inspection",
        startOn: addWorkdays(fri, 3),
        finishOn: addWorkdays(fri, 3),
        predecessorNumber: 2,
        lagDays: 1,
      },
    });
    expect(cover.sequenceProblem).toBeNull();

    // The GC slips a week: the rough-in and both inspections move five workdays.
    const shifted = await call<ScheduleShiftDto>(`${url}/${roughIn.id}/shift`, {
      method: "POST",
      as,
      json: { workdays: 5 },
    });
    expect(shifted.moved).toEqual([1, 2, 3]);
    const by = new Map(shifted.schedule.activities.map((a) => [a.number, a]));
    expect(by.get(1)).toMatchObject({ startOn: addDays(mon, 7), finishOn: addDays(fri, 7) });
    expect(by.get(2)?.startOn).toBe(addWorkdays(fri, 6));
    expect(by.get(3)?.startOn).toBe(addWorkdays(fri, 8));
    expect(shifted.schedule.summary).toMatchObject({ total: 3, conflicts: 0, percentComplete: 0 });

    // A loop is refused: the rough-in cannot wait for the cover inspection that waits on it.
    const loop = await api(`${url}/${roughIn.id}`, {
      method: "PATCH",
      as,
      json: { predecessorNumber: 3 },
    });
    expect(loop.status).toBe(400);
    expect(await loop.text()).toContain("loop");
    expect(
      (
        await api(url, {
          method: "POST",
          as,
          json: { name: "X", startOn: mon, finishOn: mon, predecessorNumber: 9 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(url, { method: "POST", as, json: { name: "X", startOn: fri, finishOn: mon } }))
        .status,
    ).toBe(400);
    expect(
      (await api(`${url}/${roughIn.id}/shift`, { method: "POST", as, json: { workdays: 0 } }))
        .status,
    ).toBe(400);

    // Deleting the predecessor leaves what waited on it in place, flagged; a later change still saves.
    await call(`${url}/${inspect.id}`, { method: "DELETE", as });
    const after = await call<ScheduleDto>(url, { as });
    const c3 = after.activities.find((a) => a.number === 3);
    expect(c3?.sequenceProblem).toBe("Waits for A-002, which is not on the schedule");
    const pct = await call<ScheduleActivityDto>(`${url}/${cover.id}`, {
      method: "PATCH",
      as,
      json: { percentComplete: 50 },
    });
    expect(pct.percentComplete).toBe(50);
    expect(after.nextNumber).toBe(4);
  });

  it("prints the lookahead as a PDF and the schedule as CSV", async () => {
    const { url, as } = await job();
    const start = mondayOf(today());
    await call(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Set fixtures", trade: "Crew B", startOn: start, finishOn: addDays(start, 4) },
    });
    await call(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: '=HYPERLINK("x")', startOn: addDays(start, 70), finishOn: addDays(start, 71) },
    });
    const pdf = await api(`${url}/lookahead.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("lookahead-riverside-clinic.pdf");
    const text = new TextDecoder().decode(await pdf.arrayBuffer());
    expect(text).toContain("(3-week lookahead) Tj");
    expect(text).toContain("(Set fixtures) Tj");
    expect(text).toContain("(A-001) Tj");
    // Ten weeks out is not in a three-week lookahead.
    expect(text).not.toContain("HYPERLINK");
    const six = new TextDecoder().decode(
      await (await api(`${url}/lookahead.pdf?weeks=6`, { as })).arrayBuffer(),
    );
    expect(six).toContain("(6-week lookahead) Tj");

    const csv = await api(`${url}/schedule.csv`, { as });
    expect(csv.headers.get("Content-Disposition")).toContain("schedule-riverside-clinic.csv");
    const body = await csv.text();
    expect(body.split("\r\n")[0]).toMatch(/^No\.,Activity,Trade or crew,Start,Finish,Workdays,/);
    expect(body).toContain(`A-001,Set fixtures,Crew B,${start},${addDays(start, 4)},5,0,`);
    expect(body).not.toContain(",=HYPERLINK");
  });

  it("lets viewers read but not write", async () => {
    const { url, as, orgId } = await job();
    const mon = nextMonday();
    const a = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "A", startOn: mon, finishOn: mon },
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<ScheduleDto>(url, { as: viewer.id })).activities).toHaveLength(1);
    expect((await api(`${url}/lookahead.pdf`, { as: viewer.id })).status).toBe(200);
    for (const [method, path, json] of [
      ["POST", url, { name: "B", startOn: mon, finishOn: mon }],
      ["PATCH", `${url}/${a.id}`, { name: "C" }],
      ["POST", `${url}/${a.id}/shift`, { workdays: 1 }],
      ["DELETE", `${url}/${a.id}`, undefined],
    ] as const) {
      expect((await api(path, { method, as: viewer.id, json })).status).toBe(403);
    }
  });

  it("keeps companies apart: another company's job and activities answer 404", async () => {
    const a = await job("Job A");
    const b = await job("Job B");
    const mon = nextMonday();
    const actA = await call<ScheduleActivityDto>(a.url, {
      method: "POST",
      as: a.as,
      expect: 201,
      json: { name: "A", startOn: mon, finishOn: mon },
    });
    expect((await api(a.url, { as: b.as })).status).toBe(404);
    const crossJob = `/api/orgs/${b.orgId}/projects/${a.projectId}/schedule`;
    expect((await api(crossJob, { as: b.as })).status).toBe(404);
    expect((await api(`${crossJob}/lookahead.pdf`, { as: b.as })).status).toBe(404);
    expect((await api(`${crossJob}/schedule.csv`, { as: b.as })).status).toBe(404);
    expect(
      (
        await api(crossJob, {
          method: "POST",
          as: b.as,
          json: { name: "X", startOn: mon, finishOn: mon },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(`${b.url}/${actA.id}`, { method: "PATCH", as: b.as, json: { name: "X" } })).status,
    ).toBe(404);
    expect(
      (await api(`${b.url}/${actA.id}/shift`, { method: "POST", as: b.as, json: { workdays: 2 } }))
        .status,
    ).toBe(404);
    expect((await api(`${b.url}/${actA.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    const still = await call<ScheduleDto>(a.url, { as: a.as });
    expect(still.activities[0]).toMatchObject({ name: "A", startOn: mon });
  });
});
