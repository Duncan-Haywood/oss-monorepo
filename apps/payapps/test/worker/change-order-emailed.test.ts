// "Last emailed" on a pending change order: copying or opening its email draft records today's date
// on the row and a row in its history. Editors only; pending only; another company gets a 404; the
// body is checked; the follow-up draft then names the last follow-up, and so do the cash report's
// next step and its CSV.
import type { JobEventDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { changeOrderEmail } from "@shared/change-order-email";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let project: ProjectDetailDto;
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Clinic TI",
      gcName: "Example Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${created.id}`;
  project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 10_000_000 }] },
  });
  project = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      number: "CO-1",
      description: "Add two exhaust fans per RFI 12",
      submittedOn: "2026-01-05",
      items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 250_000 }],
    },
  });
});

const co1 = () => project.changeOrders.find((c) => c.number === "CO-1");

describe("change order last emailed", () => {
  it("starts empty, records today and writes a history row", async () => {
    expect(co1()?.lastEmailedOn).toBeNull();
    project = await call<ProjectDetailDto>(`${base}/change-orders/${co1()?.id}/emailed`, {
      method: "POST",
      as,
      json: { kind: "follow-up" },
    });
    expect(co1()?.lastEmailedOn).toBe(today());
    const { items } = await call<{ items: JobEventDto[] }>(
      `${base}/change-orders/${co1()?.id}/history`,
      { as },
    );
    const row = items.find((e) => e.action === "change_order_emailed");
    expect(row?.data.emailKind).toBe("follow-up");
    expect(row?.data.date).toBe(today());
    expect(row?.text).toBe(
      "Change order CO-1: follow-up email draft to the GC copied or opened (sending is not recorded)",
    );
  });

  it("writes one history row per draft kind a day, however many clicks", async () => {
    const url = `${base}/change-orders/${co1()?.id}/emailed`;
    // Already one follow-up row today (above): copy again, then open in mail.
    for (const kind of ["follow-up", "follow-up", "request", "request"]) {
      project = await call<ProjectDetailDto>(url, { method: "POST", as, json: { kind } });
    }
    expect(co1()?.lastEmailedOn).toBe(today());
    const { items } = await call<{ items: JobEventDto[] }>(
      `${base}/change-orders/${co1()?.id}/history`,
      { as },
    );
    const rows = items.filter((e) => e.action === "change_order_emailed");
    expect(rows.map((e) => e.data.emailKind)).toEqual(["request", "follow-up"]);
  });

  it("does not name today's own email as an earlier follow-up", async () => {
    const co = co1();
    if (!co) throw new Error("CO-1 missing");
    const e = changeOrderEmail(
      project,
      co,
      project.changeOrders,
      { name: "A", company: "B" },
      today(),
    );
    expect(e?.body).not.toContain("my follow-up of");
  });

  it("shows in the cash report's next step and its CSV", async () => {
    const report = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    const job = report.projects.find((p) => `/api/orgs/${orgId}/projects/${p.id}` === base);
    expect(job?.pendingChanges[0]?.lastEmailedOn).toBe(today());
    expect(job?.pendingChanges[0]?.lastEmailedDays).toBe(0);
    expect(job?.actions.join(" ")).toContain(
      `has waited ${job?.pendingChanges[0]?.ageDays} days for approval since it went to Example Builders on 2026-01-05. Last follow-up emailed from here on ${today()} (today).`,
    );
    const csv = await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text();
    expect(csv).toContain(
      `(${job?.pendingChanges[0]?.ageDays} days since sent 2026-01-05; last emailed ${today()})`,
    );
  });

  it("checks the body, and refuses viewers, other companies and decided change orders", async () => {
    const url = `${base}/change-orders/${co1()?.id}/emailed`;
    for (const json of [{}, { kind: "threat" }, { kind: "request", extra: 1 }]) {
      const res = await api(url, { method: "POST", as, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }

    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const denied = await api(url, { method: "POST", as: viewer.id, json: { kind: "request" } });
    expect(denied.status).toBe(403);

    // Another company's owner, on this company's change order through their own company's URL.
    const other = await setupTenant("owner");
    const foreign = await api(url.replace(`/api/orgs/${orgId}/`, `/api/orgs/${other.orgId}/`), {
      method: "POST",
      as: other.userId,
      json: { kind: "request" },
    });
    expect(foreign.status).toBe(404);
    const across = await api(url, { method: "POST", as: other.userId, json: { kind: "request" } });
    expect([403, 404]).toContain(across.status);

    await call(`${base}/change-orders/${co1()?.id}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-01-20" },
    });
    const decided = await api(url, { method: "POST", as, json: { kind: "follow-up" } });
    expect(decided.status).toBe(409);
  });
});
