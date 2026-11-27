// The job's close-out checklist: documents from to-send to overdue to sent to accepted (or not
// required); the standard list added once; the retainage check read with the punch list and the
// latest pay application sent; editors write, viewers read; another company's job answers 404.
import type {
  CloseoutDto,
  CloseoutItemDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { addDays, type CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function job(name = "Riverside Clinic") {
  const t = await setupTenant("owner");
  const as = t.userId;
  await grantPlan(t.orgId);
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      gcName: "Harbor Builders",
      originalContractSumCents: 1_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  return { ...t, as, base, url: `${base}/closeout`, projectId: created.id };
}

/** One pay application billing `work` of the $10,000 contract, submitted. */
async function billAndSubmit(base: string, as: string, work: number) {
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 1_000_000 }] },
  });
  const lineId = project.sovLines[0]?.id ?? "";
  const to = addDays(today(), -1);
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: addDays(to, -30), periodTo: to, applicationDate: to },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: lineId,
          workThisPeriodCents: work,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
}

describe("close-out checklist", () => {
  it("tracks a document from to-send to overdue to sent to accepted, or not required", async () => {
    const { url, as } = await job();
    const empty = await call<CloseoutDto>(url, { as });
    expect(empty.items).toEqual([]);
    expect(empty.summary.delivered).toBe(false);
    expect(empty.retainage).toEqual({ heldCents: 0, lastApplication: null, workComplete: false });
    expect(empty.readiness.ready).toBe(false);

    const om = await call<CloseoutItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: {
        kind: "om_manuals",
        title: "O&M manuals",
        requiredBy: "Spec 01 78 00",
        dueOn: addDays(today(), -3),
        acceptedBy: "",
      },
    });
    expect(om.status).toBe("overdue");
    expect(om.daysOverdue).toBe(3);
    expect(om.acceptedBy).toBeNull();

    const sent = await call<CloseoutItemDto>(`${url}/${om.id}`, {
      method: "PATCH",
      as,
      json: { sentOn: today() },
    });
    expect(sent.status).toBe("sent");
    expect(sent.daysOverdue).toBe(0);

    const surety = await call<CloseoutItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "consent_of_surety", title: "Consent of surety", waivedNote: "Not bonded" },
    });
    expect(surety.status).toBe("waived");

    let list = await call<CloseoutDto>(url, { as });
    expect(list.summary).toMatchObject({
      total: 2,
      sent: 1,
      waived: 1,
      toSend: 0,
      delivered: true,
    });
    expect(list.summary.deliveredPct).toBe(100);

    const accepted = await call<CloseoutItemDto>(`${url}/${om.id}`, {
      method: "PATCH",
      as,
      json: { acceptedOn: today(), acceptedBy: "Dana Ruiz" },
    });
    expect(accepted.status).toBe("accepted");

    // Dates in order: accepted before it was sent, or sent in the future, is refused.
    const bad = await api(`${url}/${om.id}`, {
      method: "PATCH",
      as,
      json: { acceptedOn: addDays(today(), -5) },
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await api(url, {
          method: "POST",
          as,
          json: { kind: "warranty", title: "Warranty", sentOn: addDays(today(), 1) },
        })
      ).status,
    ).toBe(400);

    await call(`${url}/${surety.id}`, { method: "DELETE", as });
    list = await call<CloseoutDto>(url, { as });
    expect(list.items.map((i) => i.kind)).toEqual(["om_manuals"]);
  });

  it("adds the standard list once, with consent of surety only on a bonded job", async () => {
    const { url, as } = await job();
    await call(url, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "warranty", title: "Two-year warranty per Exhibit D" },
    });
    const first = await call<CloseoutDto>(`${url}/standard`, {
      method: "POST",
      as,
      expect: 201,
      json: { bonded: true, dueOn: addDays(today(), 14) },
    });
    const kinds = first.items.map((i) => i.kind);
    // The warranty typed by hand is kept, not doubled; the surety is added for a bonded job.
    expect(kinds.filter((k) => k === "warranty")).toHaveLength(1);
    expect(kinds).toContain("om_manuals");
    expect(kinds).toContain("consent_of_surety");
    expect(first.items[0]?.title).toBe("Two-year warranty per Exhibit D");
    const again = await call<CloseoutDto>(`${url}/standard`, {
      method: "POST",
      as,
      expect: 201,
      json: { bonded: true },
    });
    expect(again.items).toHaveLength(first.items.length);
    expect(again.summary.toSend).toBe(first.items.length);
  });

  it("says what stands between the job and its retainage, then nothing", async () => {
    const { url, base, as } = await job();
    await billAndSubmit(base, as, 1_000_000);
    const punch = await call<{ id: string }>(`${base}/punch-list`, {
      method: "POST",
      as,
      expect: 201,
      json: { description: "Missing cover plate", location: "Room 104" },
    });
    const doc = await call<CloseoutItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "as_builts", title: "As-built drawings" },
    });

    let list = await call<CloseoutDto>(url, { as });
    expect(list.retainage).toEqual({ heldCents: 100_000, lastApplication: 1, workComplete: true });
    expect(list.readiness.ready).toBe(false);
    expect(list.readiness.blockers.join(" ")).toContain("1 punch list item is not accepted yet");
    expect(list.readiness.blockers.join(" ")).toContain("1 close-out document is still to send");

    await call(`${base}/punch-list/${punch.id}`, {
      method: "PATCH",
      as,
      json: { completedOn: today(), acceptedOn: today() },
    });
    await call(`${url}/${doc.id}`, { method: "PATCH", as, json: { sentOn: today() } });
    list = await call<CloseoutDto>(url, { as });
    expect(list.readiness).toEqual({ ready: true, blockers: [] });
  });

  it("the cash report says what the finished job's retainage waits on, then that it is in", async () => {
    const { url, base, as, orgId, projectId } = await job();
    await billAndSubmit(base, as, 1_000_000);
    const cash = () => call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    // Neither list started: the plain step, not "waiting on close-out".
    const plain = (await cash()).projects.find((p) => p.id === projectId);
    expect(plain?.closeout).toBeNull();
    expect(plain?.actions[0]).toMatch(/bill the retainage/);
    const punch = await call<{ id: string }>(`${base}/punch-list`, {
      method: "POST",
      as,
      expect: 201,
      json: { description: "Missing cover plate", location: "Room 104" },
    });
    const doc = await call<CloseoutItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "warranty", title: "Warranty letter" },
    });
    let r = await cash();
    let row = r.projects.find((p) => p.id === projectId);
    expect(row?.closeout?.ready).toBe(false);
    expect(row?.actions[0]).toContain("waiting on close-out");
    expect(row?.actions[0]).toContain("1 punch list item is not accepted yet");
    expect(row?.actions[0]).toContain("1 close-out document is still to send");
    expect(r.totals.retainageOnCompleteJobsCents).toBe(100_000);
    expect(r.totals.retainageWaitingOnCloseoutCents).toBe(100_000);
    const csv = await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text();
    expect(csv.split("\r\n")[0]).toContain("Retainage waiting on close-out");

    await call(`${base}/punch-list/${punch.id}`, {
      method: "PATCH",
      as,
      json: { completedOn: today(), acceptedOn: today() },
    });
    await call(`${url}/${doc.id}`, { method: "PATCH", as, json: { sentOn: today() } });
    r = await cash();
    row = r.projects.find((p) => p.id === projectId);
    expect(row?.closeout).toEqual({ ready: true, blockers: [] });
    expect(row?.actions[0]).toContain("close-out checklist is in");
    expect(r.totals.retainageWaitingOnCloseoutCents).toBe(0);
  });

  it("asks for the rest of the work to be billed before the retainage", async () => {
    const { url, base, as } = await job();
    await billAndSubmit(base, as, 600_000);
    const list = await call<CloseoutDto>(url, { as });
    expect(list.retainage).toMatchObject({ heldCents: 60_000, workComplete: false });
    expect(list.readiness.blockers[0]).toContain("does not bill the whole contract yet");
  });

  it("lets viewers read but not write", async () => {
    const { url, as, orgId } = await job();
    const it = await call<CloseoutItemDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "warranty", title: "Warranty" },
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<CloseoutDto>(url, { as: viewer.id })).items).toHaveLength(1);
    for (const [method, path, json] of [
      ["POST", url, { kind: "warranty", title: "B" }],
      ["POST", `${url}/standard`, {}],
      ["PATCH", `${url}/${it.id}`, { title: "C" }],
      ["DELETE", `${url}/${it.id}`, undefined],
    ] as const) {
      expect((await api(path, { method, as: viewer.id, json })).status).toBe(403);
    }
  });

  it("keeps companies apart: another company's job and items answer 404", async () => {
    const a = await job("Job A");
    const b = await job("Job B");
    const itA = await call<CloseoutItemDto>(a.url, {
      method: "POST",
      as: a.as,
      expect: 201,
      json: { kind: "warranty", title: "A" },
    });
    expect((await api(a.url, { as: b.as })).status).toBe(404);
    const crossJob = `/api/orgs/${b.orgId}/projects/${a.projectId}/closeout`;
    expect((await api(crossJob, { as: b.as })).status).toBe(404);
    expect((await api(`${crossJob}/standard`, { method: "POST", as: b.as, json: {} })).status).toBe(
      404,
    );
    expect(
      (await api(`${b.url}/${itA.id}`, { method: "PATCH", as: b.as, json: { title: "X" } })).status,
    ).toBe(404);
    expect((await api(`${b.url}/${itA.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    const still = await call<CloseoutDto>(a.url, { as: a.as });
    expect(still.items[0]?.title).toBe("A");
  });
});
