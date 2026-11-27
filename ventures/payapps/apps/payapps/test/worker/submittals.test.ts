// Submittal log (/projects/:projectId/submittals): numbering, the date checks, resubmitting a
// returned submittal as the next revision, the CSV with its status columns, viewers read-only, and
// no reach into another company's job or submittal.
import type { ProjectDto, SubmittalDto, SubmittalLogDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

async function job() {
  const t = await setupTenant("owner");
  const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as: t.userId,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  return { ...t, as: t.userId, sm: `/api/orgs/${t.orgId}/projects/${p.id}/submittals` };
}

const ductwork = {
  specSection: "23 31 13",
  title: "Ductwork shop drawings",
  type: "shop_drawings",
  submittedOn: "2026-11-02",
  requiredBy: "2026-11-16",
  neededOnSite: "2027-01-15",
  leadTimeDays: 35,
  reviewDays: 14,
};

describe("submittal log", () => {
  it("numbers new submittals in order and lists them on every plan", async () => {
    const { sm, as } = await job();
    const empty = await call<SubmittalLogDto>(sm, { as });
    expect(empty.items).toEqual([]);
    expect(empty.nextNumber).toBe(1);
    expect(empty.canEdit).toBe(true);
    expect(empty.gcName).toBe("Copper State Builders");

    const a = await call<SubmittalDto>(sm, { method: "POST", as, expect: 201, json: ductwork });
    expect(a).toMatchObject({ number: 1, revision: 0, title: "Ductwork shop drawings" });
    const b = await call<SubmittalDto>(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { title: "Diffusers", type: "product_data", specSection: "" },
    });
    expect(b.number).toBe(2);
    expect(b.specSection).toBeNull();
    // A number typed by hand, then the next after it.
    await call(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { title: "VAV", type: "product_data", number: 10 },
    });
    expect((await call<SubmittalLogDto>(sm, { as })).nextNumber).toBe(11);
    // A number already on the job is refused.
    const dupe = await api(sm, { method: "POST", as, json: { ...ductwork, number: 1 } });
    expect(dupe.status).toBe(409);
  });

  it("refuses dates that do not fit together", async () => {
    const { sm, as } = await job();
    const back = await api(sm, {
      method: "POST",
      as,
      json: { title: "Grilles", type: "samples", returnedOn: "2026-11-05", action: "approved" },
    });
    expect(back.status).toBe(400);
    expect(await back.text()).toMatch(/sent/);
    const a = await call<SubmittalDto>(sm, { method: "POST", as, expect: 201, json: ductwork });
    const noAction = await api(`${sm}/${a.id}`, {
      method: "PATCH",
      as,
      json: { returnedOn: "2026-11-12" },
    });
    expect(noAction.status).toBe(400);
    const tooLong = await api(`${sm}/${a.id}`, {
      method: "PATCH",
      as,
      json: { leadTimeDays: 9999 },
    });
    expect(tooLong.status).toBe(400);
  });

  it("records the GC's action and resubmits as the next revision", async () => {
    const { sm, as } = await job();
    const a = await call<SubmittalDto>(sm, { method: "POST", as, expect: 201, json: ductwork });
    // Approved cannot be resubmitted.
    await call(`${sm}/${a.id}`, {
      method: "PATCH",
      as,
      json: { returnedOn: "2026-11-12", action: "approved" },
    });
    expect((await api(`${sm}/${a.id}/resubmit`, { method: "POST", as, json: {} })).status).toBe(
      400,
    );

    const returned = await call<SubmittalDto>(`${sm}/${a.id}`, {
      method: "PATCH",
      as,
      json: { action: "revise_resubmit", notes: "Add seismic bracing" },
    });
    expect(returned).toMatchObject({ action: "revise_resubmit", returnedOn: "2026-11-12" });
    // Not before the first revision came back.
    const early = await api(`${sm}/${a.id}/resubmit`, {
      method: "POST",
      as,
      json: { submittedOn: "2026-11-10" },
    });
    expect(early.status).toBe(400);
    const r1 = await call<SubmittalDto>(`${sm}/${a.id}/resubmit`, {
      method: "POST",
      as,
      expect: 201,
      json: { submittedOn: "2026-11-19" },
    });
    expect(r1).toMatchObject({
      number: 1,
      revision: 1,
      submittedOn: "2026-11-19",
      returnedOn: null,
      action: null,
      leadTimeDays: 35,
      notes: null,
    });
    // Only once from the same revision.
    expect((await api(`${sm}/${a.id}/resubmit`, { method: "POST", as, json: {} })).status).toBe(
      409,
    );
    const log = await call<SubmittalLogDto>(sm, { as });
    expect(log.items.map((i) => [i.number, i.revision])).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(log.nextNumber).toBe(2);
  });

  it("downloads the log as CSV with the status worked on the given day", async () => {
    const { sm, as } = await job();
    await call(sm, { method: "POST", as, expect: 201, json: ductwork });
    await call(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { title: "=cmd|' /C calc'!A0", type: "other" },
    });
    const res = await api(`${sm}/log.csv?today=2026-11-26`, { as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("submittal-log-2026-11-26.csv");
    const csv = await res.text();
    const [header, first, second] = csv.split("\r\n");
    expect(header).toContain("Days overdue");
    // Sent 2 Nov, due back 16 Nov, still out on 26 Nov: 24 days out, 10 overdue.
    expect(first).toContain("With the GC,24,10,2027-01-15,35,14,2026-11-27,No");
    // A formula-like title is quoted as text.
    expect(second).toContain("'=cmd");
    expect(csv).toContain("As of 2026-11-26.");
  });

  it("prints a transmittal cover sheet: enclosed, action requested, return-by and the revision it replaces", async () => {
    const { sm, as } = await job();
    const a = await call<SubmittalDto>(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { ...ductwork, gcReference: "M-014", notes: "Two sheets, M-401 and M-402" },
    });
    const pdf = async (path: string) => {
      const res = await api(path, { as });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      return { res, text: new TextDecoder().decode(await res.arrayBuffer()) };
    };
    let { res, text } = await pdf(`${sm}/${a.id}/transmittal.pdf?today=2026-11-26`);
    expect(res.headers.get("Content-Disposition")).toContain("transmittal-001-mesa-clinic-ti.pdf");
    expect(text).toContain("(Submittal Transmittal) Tj");
    expect(text).toContain("(Copper State Builders) Tj");
    expect(text).toContain("(23 31 13 #1) Tj");
    expect(text).toContain("(M-014) Tj");
    // Sent on 2 Nov: that date, not the print date.
    expect(text).toContain("(2026-11-02) Tj");
    expect(text).not.toContain("(2026-11-26) Tj");
    // Shop drawings go for approval unless another action is picked.
    expect(text).toContain("[X] For approval");
    expect(text).toContain("(Please return by 2026-11-16.) Tj");
    expect(text).toContain("(Two sheets, M-401 and M-402) Tj");
    expect(text).toContain("([ ] Revise and resubmit) Tj");
    expect(text).not.toContain("(Resubmittal) Tj");

    ({ text } = await pdf(`${sm}/${a.id}/transmittal.pdf?today=2026-11-26&requested=review`));
    expect(text).toContain("[X] For review and comment");
    expect(text).toContain("[ ] For approval");
    expect((await api(`${sm}/${a.id}/transmittal.pdf?requested=bogus`, { as })).status).toBe(400);

    // Returned to revise: the next revision's transmittal names the one it replaces.
    await call(`${sm}/${a.id}`, {
      method: "PATCH",
      as,
      json: { returnedOn: "2026-11-12", action: "revise_resubmit" },
    });
    const r1 = await call<SubmittalDto>(`${sm}/${a.id}/resubmit`, {
      method: "POST",
      as,
      expect: 201,
      json: {},
    });
    ({ res, text } = await pdf(`${sm}/${r1.id}/transmittal.pdf?today=2026-11-26`));
    expect(res.headers.get("Content-Disposition")).toContain(
      "transmittal-001-r1-mesa-clinic-ti.pdf",
    );
    // Not sent yet: dated the day it is printed.
    expect(text).toContain("(2026-11-26) Tj");
    expect(text).toContain("(Resubmittal) Tj");
    expect(text).toContain(
      "(This revision replaces 23 31 13 #1, returned revise and resubmit on 2026-11-12.) Tj",
    );
    expect(text).toContain("(Rev 1) Tj");

    // A close-out document goes for record by default.
    const om = await call<SubmittalDto>(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { title: "AHU O&M manual", type: "o_and_m" },
    });
    ({ text } = await pdf(`${sm}/${om.id}/transmittal.pdf`));
    expect(text).toContain("[X] For record");
  });

  it("lets viewers read but not change, and keeps other companies out", async () => {
    const { sm, as, orgId } = await job();
    const a = await call<SubmittalDto>(sm, { method: "POST", as, expect: 201, json: ductwork });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<SubmittalLogDto>(sm, { as: viewer.id });
    expect(seen.items).toHaveLength(1);
    expect(seen.canEdit).toBe(false);
    expect((await api(sm, { method: "POST", as: viewer.id, json: ductwork })).status).toBe(403);
    expect(
      (await api(`${sm}/${a.id}`, { method: "PATCH", as: viewer.id, json: { title: "x" } })).status,
    ).toBe(403);
    expect((await api(`${sm}/${a.id}`, { method: "DELETE", as: viewer.id })).status).toBe(403);
    // Every member can print the transmittal.
    expect((await api(`${sm}/${a.id}/transmittal.pdf`, { as: viewer.id })).status).toBe(200);

    const outsider = await setupTenant("owner");
    expect((await api(sm, { as: outsider.userId })).status).toBe(404);
    const theirPath = sm.replace(orgId, outsider.orgId);
    expect((await api(theirPath, { as: outsider.userId })).status).toBe(404);
    expect((await api(`${theirPath}/log.csv`, { as: outsider.userId })).status).toBe(404);
    expect(
      (
        await api(`${theirPath}/${a.id}`, {
          method: "PATCH",
          as: outsider.userId,
          json: { title: "x" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(`${theirPath}/${a.id}`, { method: "DELETE", as: outsider.userId })).status,
    ).toBe(404);
    // Their own job, our submittal's id: not found either.
    const theirs = await call<ProjectDto>(`/api/orgs/${outsider.orgId}/projects`, {
      method: "POST",
      as: outsider.userId,
      expect: 201,
      json: { name: "Other", gcName: "Other GC", originalContractSumCents: 1 },
    });
    const otherJob = `/api/orgs/${outsider.orgId}/projects/${theirs.id}/submittals`;
    expect(
      (await api(`${otherJob}/${a.id}/resubmit`, { method: "POST", as: outsider.userId, json: {} }))
        .status,
    ).toBe(404);
    expect((await api(`${otherJob}/${a.id}/transmittal.pdf`, { as: outsider.userId })).status).toBe(
      404,
    );
    expect(
      (await api(`${theirPath}/${a.id}/transmittal.pdf`, { as: outsider.userId })).status,
    ).toBe(404);

    await call(`${sm}/${a.id}`, { method: "DELETE", as });
    expect((await call<SubmittalLogDto>(sm, { as })).items).toEqual([]);
  });

  it("lists submittals to chase across the company's active jobs, and never another company's", async () => {
    const { sm, as, orgId } = await job();
    await call(sm, { method: "POST", as, expect: 201, json: ductwork }); // back by 2026-11-16
    await call(sm, {
      method: "POST",
      as,
      expect: 201,
      json: { title: "Grilles", type: "samples", submittedOn: "2026-11-02" },
    }); // no required-back date: never overdue
    const path = `/api/orgs/${orgId}/submittals/to-chase?today=2026-11-23`;
    const list = await call<{ items: Array<Record<string, unknown>> }>(path, { as });
    expect(list.items.map((x) => [x.title, x.reason, x.days, x.projectName])).toEqual([
      ["Ductwork shop drawings", "overdue_back", 7, "Mesa Clinic TI"],
    ]);
    const early = await call<{ items: unknown[] }>(
      `/api/orgs/${orgId}/submittals/to-chase?today=2026-11-10`,
      { as },
    );
    expect(early.items).toEqual([]);
    expect((await api(`/api/orgs/${orgId}/submittals/to-chase?today=nope`, { as })).status).toBe(
      400,
    );

    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<{ items: unknown[] }>(path, { as: viewer.id })).items).toHaveLength(1);
    const other = await setupTenant("owner");
    const theirs = await call<{ items: unknown[] }>(
      `/api/orgs/${other.orgId}/submittals/to-chase?today=2026-11-23`,
      { as: other.userId },
    );
    expect(theirs.items).toEqual([]);
    expect((await api(path, { as: other.userId })).status).toBe(404);
  });

  it("imports register rows numbered after the log, all or none, editors only, own jobs only", async () => {
    const { sm, as, orgId } = await job();
    await call(sm, { method: "POST", as, expect: 201, json: ductwork }); // #1
    const items = Array.from({ length: 30 }, (_, i) => ({
      specSection: "08 11 13",
      title: `Door type ${i + 1} shop drawings`,
      type: "shop_drawings",
      gcReference: `08 11 13-${i + 1}`,
      neededOnSite: "2027-02-01",
      leadTimeDays: 42,
      notes: "Spec 08 11 13: Shop Drawings: Elevations of each door type.",
    }));
    const r = await call<{ added: number; firstNumber: number; lastNumber: number }>(
      `${sm}/import`,
      { method: "POST", as, expect: 201, json: { items } },
    );
    expect(r).toEqual({ added: 30, firstNumber: 2, lastNumber: 31 });
    const log = await call<SubmittalLogDto>(sm, { as });
    expect(log.items).toHaveLength(31);
    expect(log.items[1]).toMatchObject({
      number: 2,
      revision: 0,
      gcReference: "08 11 13-1",
      submittedOn: null,
      leadTimeDays: 42,
    });
    expect(log.nextNumber).toBe(32);

    // What happened (sent, returned, action) is not part of an import.
    const sent = await api(`${sm}/import`, {
      method: "POST",
      as,
      json: { items: [{ title: "x", type: "other", submittedOn: "2026-11-01" }] },
    });
    expect(sent.status).toBe(400);
    // Over the job's limit counting what is there: refused, nothing added.
    const many = Array.from({ length: 470 }, (_, i) => ({ title: `Item ${i}`, type: "other" }));
    const over = await api(`${sm}/import`, { method: "POST", as, json: { items: many } });
    expect(over.status).toBe(400);
    expect(await over.text()).toMatch(/at most 469/);
    expect((await call<SubmittalLogDto>(sm, { as })).items).toHaveLength(31);

    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect(
      (await api(`${sm}/import`, { method: "POST", as: viewer.id, json: { items: [items[0]] } }))
        .status,
    ).toBe(403);
    const other = await setupTenant("owner");
    expect(
      (await api(`${sm}/import`, { method: "POST", as: other.userId, json: { items: [items[0]] } }))
        .status,
    ).toBe(404);
  });
});
