// Cross-tenant isolation: a member of org B can never read or change org A's data, even with
// valid ids from org A, and gets 404 (never 403) so ids cannot be probed.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, setupTenant } from "./helpers";

let a: { userId: string; orgId: string };
let b: { userId: string; orgId: string };
let projectId: string;
let lineId: string;
let payAppId: string;
let coId: string;

beforeAll(async () => {
  a = await setupTenant("owner");
  b = await setupTenant("owner");
  const p = await call<ProjectDto>(`/api/orgs/${a.orgId}/projects`, {
    method: "POST",
    as: a.userId,
    expect: 201,
    json: { name: "A's project", gcName: "GC", originalContractSumCents: 1000 },
  });
  projectId = p.id;
  const base = `/api/orgs/${a.orgId}/projects/${projectId}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as: a.userId,
    expect: 201,
    json: { itemNumber: "1", description: "Work", originalCents: 1000 },
  });
  lineId = d.sovLines[0]?.id ?? "";
  const withCo = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as: a.userId,
    expect: 201,
    json: { number: "1", description: "CO", items: [{ sovLineId: lineId, amountCents: 10 }] },
  });
  coId = withCo.changeOrders[0]?.id ?? "";
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as: a.userId,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  payAppId = app.id;
});

describe("cross-tenant access", () => {
  it("B cannot use A's org path at all", async () => {
    const res = await api(`/api/orgs/${a.orgId}/projects`, { as: b.userId });
    expect(res.status).toBe(404);
    const write = await api(`/api/orgs/${a.orgId}/projects`, {
      method: "POST",
      as: b.userId,
      json: { name: "x", gcName: "x", originalContractSumCents: 1 },
    });
    expect(write.status).toBe(404);
  });

  it("B cannot reach A's resources through B's own org path", async () => {
    const base = `/api/orgs/${b.orgId}/projects/${projectId}`;
    const attempts: [string, string, unknown?][] = [
      ["GET", base],
      ["PATCH", base, { name: "hijack" }],
      ["DELETE", base],
      ["POST", `${base}/sov-lines`, { itemNumber: "2", description: "x", originalCents: 1 }],
      ["PATCH", `${base}/sov-lines/${lineId}`, { description: "x" }],
      ["DELETE", `${base}/sov-lines/${lineId}`],
      [
        "PUT",
        `${base}/opening`,
        {
          appNumber: 3,
          periodTo: "2025-12-31",
          previousCertificatesCents: 1,
          lines: [{ sovLineId: lineId, completedCents: 1 }],
        },
      ],
      ["DELETE", `${base}/opening`],
      [
        "POST",
        `${base}/change-orders`,
        { number: "9", description: "x", items: [{ sovLineId: lineId, amountCents: 1 }] },
      ],
      ["POST", `${base}/change-orders/${coId}/approve`, { approvedOn: "2026-02-01" }],
      ["PUT", `${base}/change-orders/${coId}/schedule`, { scheduleDays: 2 }],
      ["GET", `${base}/change-orders/${coId}/request.pdf`],
      ["DELETE", `${base}/change-orders/${coId}`],
      ["GET", `${base}/pay-apps`],
      [
        "POST",
        `${base}/pay-apps`,
        { periodFrom: "2026-02-01", periodTo: "2026-02-28", applicationDate: "2026-02-28" },
      ],
      ["GET", `${base}/pay-apps/${payAppId}`],
      ["PUT", `${base}/pay-apps/${payAppId}/lines`, { lines: [] }],
      ["POST", `${base}/pay-apps/${payAppId}/submit`],
      ["DELETE", `${base}/pay-apps/${payAppId}`],
      ["GET", `${base}/pay-apps/${payAppId}/application.pdf`],
      ["GET", `${base}/pay-apps/${payAppId}/continuation.csv`],
      ["GET", `${base}/pay-apps/${payAppId}/summary.csv`],
    ];
    for (const [method, path, json] of attempts) {
      const res = await api(path, { method, as: b.userId, ...(json ? { json } : {}) });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("B's change order cannot reference A's SOV line", async () => {
    const p = await call<ProjectDto>(`/api/orgs/${b.orgId}/projects`, {
      method: "POST",
      as: b.userId,
      expect: 201,
      json: { name: "B's project", gcName: "GC", originalContractSumCents: 0 },
    });
    const res = await api(`/api/orgs/${b.orgId}/projects/${p.id}/change-orders`, {
      method: "POST",
      as: b.userId,
      json: { number: "1", description: "x", items: [{ sovLineId: lineId, amountCents: 5 }] },
    });
    expect(res.status).toBe(400);
  });

  it("B's opening balance cannot reference A's SOV line", async () => {
    // B's own job from the change-order test (the Free plan allows one active job).
    const { items } = await call<{ items: ProjectDto[] }>(`/api/orgs/${b.orgId}/projects`, {
      as: b.userId,
    });
    const res = await api(`/api/orgs/${b.orgId}/projects/${items[0]?.id}/opening`, {
      method: "PUT",
      as: b.userId,
      json: {
        appNumber: 2,
        periodTo: "2025-12-31",
        previousCertificatesCents: 0,
        lines: [{ sovLineId: lineId, completedCents: 5 }],
      },
    });
    expect(res.status).toBe(400);
  });

  it("A's data is unchanged and B's lists show none of it", async () => {
    const d = await call<ProjectDetailDto>(`/api/orgs/${a.orgId}/projects/${projectId}`, {
      as: a.userId,
    });
    expect(d.name).toBe("A's project");
    expect(d.sovLines).toHaveLength(1);
    expect(d.changeOrders[0]?.status).toBe("pending");
    expect(d.payApps).toHaveLength(1);
    const list = await call<{ items: ProjectDto[] }>(`/api/orgs/${b.orgId}/projects`, {
      as: b.userId,
    });
    expect(list.items.map((p) => p.id)).not.toContain(projectId);
  });
});
