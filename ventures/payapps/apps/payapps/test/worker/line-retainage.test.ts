// Per-line retainage rates on the schedule of values (real local D1).
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let bond: string;
let work: string;
let finish: string;

const entry = (sovLineId: string, w: number, stored = 0) => ({
  sovLineId,
  workThisPeriodCents: w,
  storedMaterialsCents: stored,
  retainageReleasedCents: 0,
});

const rate = (p: ProjectDetailDto, id: string) => p.sovLines.find((l) => l.id === id);

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Clinic",
      gcName: "Example Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${created.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Bond", originalCents: 200_000 },
        { itemNumber: "2", description: "Rough-in", originalCents: 5_800_000 },
        { itemNumber: "3", description: "Trim", originalCents: 4_000_000 },
      ],
    },
  });
  [bond = "", work = "", finish = ""] = p.sovLines.map((l) => l.id);
});

describe("per-line retainage", () => {
  it("lines follow the application by default and take their own rate", async () => {
    const before = await call<ProjectDetailDto>(base, { as });
    expect(rate(before, bond)).toMatchObject({ retainagePctBps: null, retainageLocked: false });
    const after = await call<ProjectDetailDto>(`${base}/sov-lines/${bond}`, {
      method: "PATCH",
      as,
      json: { retainagePctBps: 0 },
    });
    expect(rate(after, bond)?.retainagePctBps).toBe(0);
  });

  it("refuses a rate over 100%", async () => {
    const res = await api(`${base}/sov-lines/${work}`, {
      method: "PATCH",
      as,
      json: { retainagePctBps: 10_001 },
    });
    expect(res.status).toBe(400);
  });

  it("holds the line's rate on the pay application, PDF and CSV", async () => {
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    const filled = await call<PayAppDetailDto>(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [entry(bond, 200_000), entry(work, 1_000_000)] },
    });
    const s = filled.computed.summary;
    // Bond billed in full with no retainage; rough-in at the job's 10%.
    expect(s.retainageOnCompletedWorkCents).toBe(100_000);
    expect(s.currentPaymentDueCents).toBe(1_200_000 - 100_000);
    expect(s.lineRates).toEqual([{ sovLineId: bond, itemNumber: "1", retainagePctBps: 0 }]);
    const csv = await (await api(`${base}/pay-apps/${app.id}/summary.csv`, { as })).text();
    expect(csv).toContain("Lines held at their own retainage rate");
    expect(csv).toContain("item 1 at 0%");
    const pdf = await api(`${base}/pay-apps/${app.id}/application.pdf`, { as });
    expect(pdf.status).toBe(200);
    await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  });

  it("locks the rate of a line a submitted application holds retainage on", async () => {
    const res = await api(`${base}/sov-lines/${bond}`, {
      method: "PATCH",
      as,
      json: { retainagePctBps: 1000 },
    });
    expect(res.status).toBe(409);
    const p = await call<ProjectDetailDto>(base, { as });
    expect(rate(p, bond)).toMatchObject({ retainagePctBps: 0, retainageLocked: true });
    expect(rate(p, work)?.retainageLocked).toBe(true);
    // Trim has nothing billed yet, so its rate can still be set (and saving the same rate is fine).
    expect(rate(p, finish)?.retainageLocked).toBe(false);
    await call(`${base}/sov-lines/${finish}`, {
      method: "PATCH",
      as,
      json: { retainagePctBps: 500 },
    });
    await call(`${base}/sov-lines/${bond}`, { method: "PATCH", as, json: { retainagePctBps: 0 } });
  });

  it("viewers cannot set a rate and another company cannot reach the line", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const v = await api(`${base}/sov-lines/${finish}`, {
      method: "PATCH",
      as: viewer.id,
      json: { retainagePctBps: 0 },
    });
    expect(v.status).toBe(403);
    const other = await setupTenant("owner");
    const x = await api(`${base}/sov-lines/${finish}`, {
      method: "PATCH",
      as: other.userId,
      json: { retainagePctBps: 0 },
    });
    expect([403, 404]).toContain(x.status);
    const p = await call<ProjectDetailDto>(base, { as });
    expect(rate(p, finish)?.retainagePctBps).toBe(500);
  });
});
