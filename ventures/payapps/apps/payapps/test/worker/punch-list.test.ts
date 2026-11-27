// The job's punch list: numbered items from open to overdue to done to accepted (or "not ours");
// a pasted list added in one go, all or nothing; the PDF and CSV; editors write, viewers read;
// another company's job and items answer 404.
import type { ProjectDto, PunchItemDto, PunchListDto } from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function job(name = "Riverside Clinic") {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      gcPmName: "Dana Ruiz",
      gcPmEmail: "dana@harbor.example",
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  return { ...t, as, base, url: `${base}/punch-list`, projectId: created.id };
}

describe("punch list", () => {
  it("numbers items and tracks them from open to overdue to done to accepted", async () => {
    const { url, as } = await job();
    const empty = await call<PunchListDto>(url, { as });
    expect(empty.items).toEqual([]);
    expect(empty.nextNumber).toBe(1);
    expect(empty.summary.closed).toBe(false);

    const first = await call<PunchItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: {
        description: "Missing cover plate",
        location: "Room 104",
        source: "gc",
        listedOn: addDays(today(), -10),
        dueOn: addDays(today(), -2),
        completedBy: "",
      },
    });
    expect(first.number).toBe(1);
    expect(first.status).toBe("overdue");
    expect(first.daysOverdue).toBe(2);
    expect(first.completedBy).toBeNull();

    const done = await call<PunchItemDto>(`${url}/${first.id}`, {
      method: "PATCH",
      as,
      json: { completedOn: today(), completedBy: "Luis" },
    });
    expect(done.status).toBe("done");
    expect(done.daysOverdue).toBe(0);

    const second = await call<PunchItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { description: "Patch at ceiling grid", disputeNote: "Drywall scope" },
    });
    expect(second.number).toBe(2);
    expect(second.status).toBe("disputed");

    let list = await call<PunchListDto>(url, { as });
    expect(list.summary).toMatchObject({ total: 2, done: 1, disputed: 1, toFix: 0, closed: false });

    const accepted = await call<PunchItemDto>(`${url}/${first.id}`, {
      method: "PATCH",
      as,
      json: { acceptedOn: today(), acceptedBy: "Dana Ruiz" },
    });
    expect(accepted.status).toBe("accepted");
    list = await call<PunchListDto>(url, { as });
    expect(list.summary).toMatchObject({ accepted: 1, acceptedPct: 100, closed: true });

    // The next number is one past the highest on the list.
    await call(`${url}/${second.id}`, { method: "DELETE", as });
    list = await call<PunchListDto>(url, { as });
    expect(list.items.map((i) => i.number)).toEqual([1]);
    expect(list.nextNumber).toBe(2);
  });

  it("adds a pasted list in order, all or nothing", async () => {
    const { url, as } = await job();
    await call(url, { method: "POST", as, expect: 201, json: { description: "One" } });
    const res = await api(`${url}/bulk`, {
      method: "POST",
      as,
      json: {
        items: [
          { description: "Two", listedOn: today() },
          { description: "Three", listedOn: today(), dueOn: addDays(today(), -1) },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Line 2: The due date cannot be before the date listed");
    expect((await call<PunchListDto>(url, { as })).items).toHaveLength(1);

    const list = await call<PunchListDto>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        items: [
          { description: "Two", location: "Corridor 2", source: "architect" },
          { description: "Three", dueOn: addDays(today(), 7) },
        ],
      },
    });
    expect(list.items.map((i) => [i.number, i.description])).toEqual([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
    ]);
    expect(list.items[1]?.source).toBe("architect");
  });

  it("refuses dates out of order, future dates, a duplicate number and an unknown field", async () => {
    const { url, as } = await job();
    const bad = async (json: Record<string, unknown>, status = 400) =>
      expect((await api(url, { method: "POST", as, json })).status).toBe(status);
    await bad({ description: "A", completedOn: addDays(today(), 1) });
    await bad({ description: "A", completedOn: today(), acceptedOn: addDays(today(), -1) });
    await bad({ description: "A", source: "plumber" });
    await bad({ description: "  " });
    await bad({ description: "A", photo: "x" });
    const it = await call<PunchItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { description: "A", number: 5 },
    });
    await bad({ description: "B", number: 5 }, 409);
    const patch = await api(`${url}/${it.id}`, {
      method: "PATCH",
      as,
      json: { listedOn: today(), completedOn: addDays(today(), -3) },
    });
    expect(patch.status).toBe(400);
  });

  it("prints the list as a PDF (all, or only what is left) and as CSV", async () => {
    const { url, as } = await job();
    await call(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        items: [
          { description: "Missing cover plate", location: "Room 104", completedOn: today() },
          { description: "Label panel LP-2", acceptedOn: today(), acceptedBy: "DR" },
          { description: '=HYPERLINK("x")', location: "Roof" },
        ],
      },
    });
    const pdf = await api(`${url}/punch-list.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("punch-list-riverside-clinic.pdf");
    let text = new TextDecoder().decode(await pdf.arrayBuffer());
    expect(text).toContain("(Punch list) Tj");
    expect(text).toContain("(P-001) Tj");
    expect(text).toContain("(Label panel LP-2) Tj");
    expect(text).toContain("(Done, awaiting back-check) Tj");

    const open = await api(`${url}/punch-list.pdf?only=open`, { as });
    text = new TextDecoder().decode(await open.arrayBuffer());
    expect(text).toContain("(Missing cover plate) Tj");
    expect(text).not.toContain("(Label panel LP-2) Tj");

    const csv = await api(`${url}/punch-list.csv`, { as });
    expect(csv.headers.get("Content-Disposition")).toContain("punch-list-riverside-clinic.csv");
    const body = await csv.text();
    expect(body.split("\r\n")[0]).toMatch(/^No\.,Location,Item,Status,/);
    expect(body).toContain('P-001,Room 104,Missing cover plate,"Done, awaiting back-check"');
    // A formula typed into an item is neutralised.
    expect(body).not.toContain(",=HYPERLINK");
  });

  it("lets viewers read but not write", async () => {
    const { url, as, orgId } = await job();
    const it = await call<PunchItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { description: "A" },
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<PunchListDto>(url, { as: viewer.id })).items).toHaveLength(1);
    expect((await api(`${url}/punch-list.pdf`, { as: viewer.id })).status).toBe(200);
    for (const [method, path, json] of [
      ["POST", url, { description: "B" }],
      ["POST", `${url}/bulk`, { items: [{ description: "B" }] }],
      ["PATCH", `${url}/${it.id}`, { description: "C" }],
      ["DELETE", `${url}/${it.id}`, undefined],
    ] as const) {
      expect((await api(path, { method, as: viewer.id, json })).status).toBe(403);
    }
  });

  it("keeps companies apart: another company's job and items answer 404", async () => {
    const a = await job("Job A");
    const b = await job("Job B");
    const itA = await call<PunchItemDto>(a.url, {
      method: "POST",
      as: a.as,
      expect: 201,
      json: { description: "A" },
    });
    expect((await api(a.url, { as: b.as })).status).toBe(404);
    const crossJob = `/api/orgs/${b.orgId}/projects/${a.projectId}/punch-list`;
    expect((await api(crossJob, { as: b.as })).status).toBe(404);
    expect((await api(`${crossJob}/punch-list.pdf`, { as: b.as })).status).toBe(404);
    expect(
      (
        await api(`${crossJob}/bulk`, {
          method: "POST",
          as: b.as,
          json: { items: [{ description: "X" }] },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(`${b.url}/${itA.id}`, { method: "PATCH", as: b.as, json: { description: "X" } }))
        .status,
    ).toBe(404);
    expect((await api(`${b.url}/${itA.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    const still = await call<PunchListDto>(a.url, { as: a.as });
    expect(still.items[0]?.description).toBe("A");
  });
});
