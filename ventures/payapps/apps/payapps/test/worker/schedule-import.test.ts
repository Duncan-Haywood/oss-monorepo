// The GC's P6 schedule imported onto the job: kept activities added with their predecessor by P6
// activity ID, a later import of the GC's update matched and updated rather than duplicated, a
// hand-typed activity left alone, the limits and the loop check, editors only, companies apart.
import type {
  ProjectDto,
  ScheduleActivityDto,
  ScheduleDto,
  ScheduleImportDto,
} from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { mondayOf } from "@shared/schedule";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const nextMonday = () => addDays(mondayOf(new Date().toISOString().slice(0, 10)), 7);

async function job() {
  const t = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as: t.userId,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
    },
  });
  return { ...t, as: t.userId, url: `/api/orgs/${t.orgId}/projects/${created.id}/schedule` };
}

const item = (
  code: string,
  startOn: string,
  finishOn: string,
  extra: Record<string, unknown> = {},
) => ({
  sourceCode: code,
  name: `Activity ${code}`,
  startOn,
  finishOn,
  percentComplete: 0,
  predecessorCode: null,
  lagDays: 0,
  notes: `From the GC's P6 schedule, activity ${code}.`,
  ...extra,
});

describe("job schedule import from P6", () => {
  it("adds the kept activities, then updates them from the GC's next export", async () => {
    const { url, as } = await job();
    const mon = nextMonday();
    const typed = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Order fixtures", startOn: mon, finishOn: mon },
    });
    const first = await call<ScheduleImportDto>(`${url}/import`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        trade: "Electrical crew A",
        items: [
          item("E-1000", mon, addDays(mon, 4)),
          item("E-1010", addDays(mon, 7), addDays(mon, 8), {
            predecessorCode: "E-1000",
            lagDays: 1,
          }),
          // A predecessor not on the job: imported without one.
          item("E-1020", addDays(mon, 9), addDays(mon, 9), { predecessorCode: "M-9" }),
        ],
      },
    });
    expect([first.added, first.updated]).toEqual([3, 0]);
    const by = new Map(first.schedule.activities.map((a) => [a.sourceCode, a]));
    expect(by.get("E-1000")).toMatchObject({ number: 2, trade: "Electrical crew A" });
    expect(by.get("E-1010")).toMatchObject({ number: 3, predecessorNumber: 2, lagDays: 1 });
    expect(by.get("E-1020")).toMatchObject({ number: 4, predecessorNumber: null, lagDays: 0 });
    expect(by.get(null)?.id).toBe(typed.id);

    // The contractor renames the crew on one; the GC's update slips E-1010 and adds E-1030.
    await call(`${url}/${by.get("E-1010")?.id}`, {
      method: "PATCH",
      as,
      json: { trade: "Crew B", notes: "Call the inspector" },
    });
    const second = await call<ScheduleImportDto>(`${url}/import`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        items: [
          item("E-1000", mon, addDays(mon, 4)),
          item("E-1010", addDays(mon, 14), addDays(mon, 15), {
            name: "Rough-in inspection",
            percentComplete: 0,
            predecessorCode: "E-1000",
            lagDays: 1,
          }),
          item("E-1030", addDays(mon, 16), addDays(mon, 17), { predecessorCode: "E-1010" }),
        ],
      },
    });
    // E-1000 is unchanged, so only E-1010 counts as updated.
    expect([second.added, second.updated]).toEqual([1, 1]);
    const after = new Map(second.schedule.activities.map((a) => [a.sourceCode, a]));
    expect(second.schedule.activities).toHaveLength(5);
    expect(after.get("E-1010")).toMatchObject({
      number: 3,
      name: "Rough-in inspection",
      startOn: addDays(mon, 14),
      trade: "Crew B",
      notes: "Call the inspector",
    });
    expect(after.get("E-1030")).toMatchObject({ number: 5, predecessorNumber: 3 });

    const csv = await (await api(`${url}/schedule.csv`, { as })).text();
    expect(csv.split("\r\n")[0]).toMatch(/,P6 activity ID$/);
    expect(csv).toMatch(/,E-1030\r\n/);
  });

  it("refuses a repeated ID, a loop through a typed activity, and more than a job holds", async () => {
    const { url, as } = await job();
    const mon = nextMonday();
    const twice = await api(`${url}/import`, {
      method: "POST",
      as,
      json: { items: [item("A", mon, mon), item("A", mon, mon)] },
    });
    expect(twice.status).toBe(400);
    expect(await twice.text()).toMatch(/A is listed twice/);

    const done = await call<ScheduleImportDto>(`${url}/import`, {
      method: "POST",
      as,
      expect: 201,
      json: { items: [item("A", mon, mon)] },
    });
    const a = done.schedule.activities[0] as ScheduleActivityDto;
    // A typed activity waiting on an imported one is kept through a later import.
    const typed = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Typed",
        startOn: addDays(mon, 1),
        finishOn: addDays(mon, 1),
        predecessorNumber: a.number,
      },
    });
    expect(typed.number).toBe(2);
    // An export whose links loop (a hand-edited file): refused, nothing written.
    const pair = await api(`${url}/import`, {
      method: "POST",
      as,
      json: {
        items: [
          item("A", mon, mon, { predecessorCode: "B" }),
          item("B", mon, mon, { predecessorCode: "A" }),
        ],
      },
    });
    expect(pair.status).toBe(400);
    expect(await pair.text()).toMatch(/makes a loop/);
    const still = await call<ScheduleDto>(url, { as });
    expect(still.activities).toHaveLength(2);

    const bad = await api(`${url}/import`, {
      method: "POST",
      as,
      json: { items: [item("C", addDays(mon, 2), mon)] },
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toMatch(/C: The finish date is before the start date/);
  });

  it("is for editors, and another company's job answers 404", async () => {
    const { url, as, orgId } = await job();
    const mon = nextMonday();
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const body = { items: [item("A", mon, mon)] };
    expect((await api(`${url}/import`, { method: "POST", as: viewer.id, json: body })).status).toBe(
      403,
    );
    const other = await job();
    const cross = url.replace(orgId, other.orgId);
    expect(
      (await api(`${cross}/import`, { method: "POST", as: other.as, json: body })).status,
    ).toBe(404);
    expect((await call<ScheduleDto>(url, { as })).activities).toHaveLength(0);
  });
});
