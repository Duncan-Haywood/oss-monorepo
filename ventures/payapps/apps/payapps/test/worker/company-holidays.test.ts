// The company's holidays: added (typed or the federal list), listed in date order, duplicates kept
// once, left out of a job schedule's workdays, its shift and the crew lookahead's day columns;
// every member reads them, only editors change them, and another company's never appear or count.
// 2030-11-25 is a Monday, 2030-11-28 Thanksgiving (a Thursday), 2030-12-02 the Monday after.
import type {
  CompanyHolidaysDto,
  CrewLookaheadDto,
  ProjectDto,
  ScheduleActivityDto,
  ScheduleDto,
  ScheduleShiftDto,
} from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { federalHolidays, mondayOf } from "@shared/schedule";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

async function company() {
  const t = await setupTenant("owner");
  const as = t.userId;
  const url = `/api/orgs/${t.orgId}/schedule/holidays`;
  const add = (holidays: { on: string; name: string }[], expect = 201) =>
    call<CompanyHolidaysDto>(url, { method: "POST", as, expect, json: { holidays } });
  const job = async () => {
    const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Riverside Clinic",
        gcName: "Harbor Builders",
        originalContractSumCents: 1_000,
      },
    });
    return `/api/orgs/${t.orgId}/projects/${p.id}/schedule`;
  };
  return { ...t, as, url, add, job };
}

describe("company holidays", () => {
  it("adds, lists in date order, keeps a date once and deletes", async () => {
    const c = await company();
    expect(await call<CompanyHolidaysDto>(c.url, { as: c.as })).toEqual({ holidays: [], max: 200 });
    await c.add([
      { on: "2030-12-25", name: "Christmas Day" },
      { on: "2030-11-28", name: "Thanksgiving" },
      { on: "2030-11-28", name: "Thanksgiving again" },
    ]);
    const again = await c.add([
      { on: "2030-11-28", name: "Renamed" },
      { on: "2030-11-29", name: "Day after Thanksgiving" },
    ]);
    expect(again.holidays.map((h) => [h.on, h.name])).toEqual([
      ["2030-11-28", "Thanksgiving"],
      ["2030-11-29", "Day after Thanksgiving"],
      ["2030-12-25", "Christmas Day"],
    ]);
    // The federal list twice adds it once.
    await c.add(federalHolidays(2031));
    const twice = await c.add(federalHolidays(2031));
    expect(twice.holidays).toHaveLength(3 + federalHolidays(2031).length);

    const first = twice.holidays[0]?.id as string;
    expect(await call(`${c.url}/${first}`, { method: "DELETE", as: c.as })).toEqual({ ok: true });
    expect((await api(`${c.url}/${first}`, { method: "DELETE", as: c.as })).status).toBe(404);
  });

  it("refuses a date that is not on the calendar, a blank name and an empty list", async () => {
    const c = await company();
    await c.add([{ on: "2030-02-30", name: "Nope" }], 400);
    await c.add([{ on: "2030-13-01", name: "Nope" }], 400);
    await c.add([{ on: "2030-11-28", name: "  " }], 400);
    await c.add([], 400);
  });

  it("leaves holidays out of the job schedule's workdays, its check and its shift", async () => {
    const c = await company();
    const url = await c.job();
    const a1 = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as: c.as,
      expect: 201,
      json: { name: "Rough-in", startOn: "2030-11-25", finishOn: "2030-11-29" },
    });
    expect(a1.workdays).toBe(5);
    await call(url, {
      method: "POST",
      as: c.as,
      expect: 201,
      json: {
        name: "Inspect",
        startOn: "2030-12-02",
        finishOn: "2030-12-02",
        predecessorNumber: 1,
      },
    });
    await c.add([
      { on: "2030-11-28", name: "Thanksgiving" },
      { on: "2030-11-29", name: "Day after" },
    ]);
    const s = await call<ScheduleDto>(url, { as: c.as });
    expect(s.activities[0]?.workdays).toBe(3);
    expect(s.activities[1]?.earliestStart).toBe("2030-12-02");
    expect(s.holidays.map((h) => h.on)).toEqual(["2030-11-28", "2030-11-29"]);
    const r = await call<ScheduleShiftDto>(`${url}/${a1.id}/shift`, {
      method: "POST",
      as: c.as,
      json: { workdays: -2 },
    });
    // Mon 11-25 two workdays earlier is Thu 11-21; Fri 11-29 (a holiday) back two is Tue 11-26
    // (stepping back over Thu 11-28 to Wed 11-27, then Tue 11-26).
    expect(r.schedule.activities.find((a) => a.number === 1)).toMatchObject({
      startOn: "2030-11-21",
      finishOn: "2030-11-26",
    });
    // Inspect moved with it: Mon 12-02 back two workdays over both holidays is Tue 11-26.
    expect(r.schedule.activities.find((a) => a.number === 2)).toMatchObject({
      startOn: "2030-11-26",
    });
  });

  it("drops a holiday from the crew lookahead's days and names it, PDF too", async () => {
    const c = await company();
    const tue = addDays(addDays(mondayOf(new Date().toISOString().slice(0, 10)), 7), 1);
    await c.add([{ on: tue, name: "Company picnic" }]);
    const crews = `/api/orgs/${c.orgId}/schedule/crews`;
    const la = await call<CrewLookaheadDto>(crews, { as: c.as });
    expect(la.lookahead.days).toHaveLength(9);
    expect(la.lookahead.days).not.toContain(tue);
    expect(la.lookahead.holidays).toEqual([{ on: tue, name: "Company picnic" }]);
    const pdf = new TextDecoder().decode(
      await (await api(`${crews}.pdf`, { as: c.as })).arrayBuffer(),
    );
    expect(pdf).toContain("picnic");
  });

  it("lets every member read them and only editors change them", async () => {
    const c = await company();
    const added = await c.add([{ on: "2030-11-28", name: "Thanksgiving" }]);
    const viewer = await createTestUser();
    await addToOrg(c.orgId, viewer.id, "viewer");
    expect((await api(c.url, { as: viewer.id })).status).toBe(200);
    const json = { holidays: [{ on: "2030-12-25", name: "Christmas" }] };
    expect((await api(c.url, { method: "POST", as: viewer.id, json })).status).toBe(403);
    const id = added.holidays[0]?.id as string;
    expect((await api(`${c.url}/${id}`, { method: "DELETE", as: viewer.id })).status).toBe(403);
  });

  it("keeps companies apart", async () => {
    const a = await company();
    const b = await company();
    const added = await a.add([{ on: "2030-11-28", name: "Thanksgiving" }]);
    const id = added.holidays[0]?.id as string;
    expect((await api(a.url, { as: b.as })).status).toBe(404);
    // B's own route cannot reach A's row by id.
    expect((await api(`${b.url}/${id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    expect((await call<CompanyHolidaysDto>(a.url, { as: a.as })).holidays).toHaveLength(1);
    expect((await call<CompanyHolidaysDto>(b.url, { as: b.as })).holidays).toEqual([]);
    // A's holiday does not shorten B's activity.
    const url = await b.job();
    const act = await call<ScheduleActivityDto>(url, {
      method: "POST",
      as: b.as,
      expect: 201,
      json: { name: "Rough-in", startOn: "2030-11-25", finishOn: "2030-11-29" },
    });
    expect(act.workdays).toBe(5);
  });
});
