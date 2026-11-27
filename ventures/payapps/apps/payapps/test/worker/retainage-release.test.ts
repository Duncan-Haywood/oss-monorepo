// Retainage release by percentage or amount on a draft pay application (real local D1).
import type {
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  RetainageReleaseDto,
} from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let lineIds: string[];
let app2: PayAppDetailDto;

const line = (sovLineId: string, work: number, stored = 0, released = 0) => ({
  sovLineId,
  workThisPeriodCents: work,
  storedMaterialsCents: stored,
  retainageReleasedCents: released,
});

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId);
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Warehouse",
      gcName: "Example Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Underground", originalCents: 6_000_000 },
        { itemNumber: "2", description: "Finish", originalCents: 4_000_000 },
      ],
    },
  });
  lineIds = project.sovLines.map((l) => l.id);
  const [l1 = "", l2 = ""] = lineIds;
  // #1: line 1 complete ($6,000 held), line 2 half done ($2,000 held). Submitted.
  const app1 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  await call(`${base}/pay-apps/${app1.id}/lines`, {
    method: "PUT",
    as,
    json: { lines: [line(l1, 6_000_000), line(l2, 2_000_000)] },
  });
  await call(`${base}/pay-apps/${app1.id}/submit`, { method: "POST", as });
  // #2 draft: $500 more on line 2 (held on it becomes $2,050).
  app2 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-02-01", periodTo: "2026-02-28", applicationDate: "2026-02-28" },
  });
  app2 = await call<PayAppDetailDto>(`${base}/pay-apps/${app2.id}/lines`, {
    method: "PUT",
    as,
    json: { lines: [line(l2, 50_000)] },
  });
});

const release = (json: unknown, user = as) =>
  api(`${base}/pay-apps/${app2.id}/retainage-release`, { method: "POST", as: user, json });

describe("retainage release", () => {
  it("previews without changing the draft", async () => {
    const res = await release({ scope: "all", percentBps: 5000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RetainageReleaseDto;
    expect(body.applied).toBe(false);
    expect(body.plan.heldCents).toBe(805_000);
    expect(body.plan.releaseCents).toBe(402_500);
    expect(body.plan.lines.map((l) => l.releaseCents)).toEqual([300_000, 102_500]);
    const after = await call<PayAppDetailDto>(`${base}/pay-apps/${app2.id}`, { as });
    expect(after.computed.summary.totalRetainageCents).toBe(805_000);
  });

  it("applies all retainage on complete lines and keeps the other entries", async () => {
    const before = await call<PayAppDetailDto>(`${base}/pay-apps/${app2.id}`, { as });
    const body = await call<RetainageReleaseDto>(`${base}/pay-apps/${app2.id}/retainage-release`, {
      method: "POST",
      as,
      json: { scope: "complete", percentBps: 10_000, apply: true },
    });
    expect(body.applied).toBe(true);
    expect(body.plan.releaseCents).toBe(600_000);
    const d = body.detail as PayAppDetailDto;
    expect(d.entries[lineIds[0] ?? ""]?.retainageReleasedCents).toBe(600_000);
    expect(d.entries[lineIds[1] ?? ""]).toEqual({
      workThisPeriodCents: 50_000,
      storedMaterialsCents: 0,
      retainageReleasedCents: 0,
      quantityThisPeriodMilli: null,
    });
    expect(d.computed.summary.totalRetainageCents).toBe(205_000);
    expect(d.computed.summary.currentPaymentDueCents).toBe(
      before.computed.summary.currentPaymentDueCents + 600_000,
    );
    expect(d.blockers).toEqual([]);
  });

  it("re-planning replaces the earlier release instead of stacking on it", async () => {
    const body = await call<RetainageReleaseDto>(`${base}/pay-apps/${app2.id}/retainage-release`, {
      method: "POST",
      as,
      json: { scope: "selected", sovLineIds: [lineIds[0]], amountCents: 100_000, apply: true },
    });
    expect(body.plan.lines[0]).toMatchObject({ heldCents: 600_000, currentReleaseCents: 600_000 });
    expect(body.plan.changeCents).toBe(-500_000);
    expect(body.detail?.entries[lineIds[0] ?? ""]?.retainageReleasedCents).toBe(100_000);
  });

  it("refuses an amount above what is held, with the reason", async () => {
    const res = await release({ scope: "all", amountCents: 999_999_99, apply: true });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("release_not_possible");
    expect(body.error.message).toContain("more than");
  });

  it("validates the body", async () => {
    expect((await release({ scope: "all" })).status).toBe(400);
    expect((await release({ scope: "all", percentBps: 10, amountCents: 10 })).status).toBe(400);
    expect((await release({ scope: "selected", percentBps: 10 })).status).toBe(400);
  });

  it("viewers cannot release; other companies cannot see the application", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await release({ scope: "all", percentBps: 10_000 }, viewer.id)).status).toBe(403);
    const other = await setupTenant("owner");
    expect((await release({ scope: "all", percentBps: 10_000 }, other.userId)).status).toBe(404);
  });

  it("only a draft can be changed", async () => {
    await call(`${base}/pay-apps/${app2.id}/submit`, { method: "POST", as });
    expect((await release({ scope: "all", percentBps: 10_000 })).status).toBe(409);
  });
});
