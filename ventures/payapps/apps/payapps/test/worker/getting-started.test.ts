// The getting-started checklist (real local D1): computed from the company's own data only.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { GettingStarted } from "@shared/getting-started";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const done = (g: GettingStarted) => Object.fromEntries(g.steps.map((s) => [s.key, s.done]));

describe("getting started", () => {
  it("follows a company from sign-up to its first payment, ignoring the sample job", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const path = `/api/orgs/${orgId}/getting-started`;
    let g = await call<GettingStarted>(path, { as });
    expect(g).toMatchObject({ requiredDone: 0, requiredTotal: 5, complete: false });

    // The sample job is fully billed, but none of it is theirs.
    await call(`/api/orgs/${orgId}/projects/sample`, { method: "POST", as, expect: 201 });
    g = await call<GettingStarted>(path, { as });
    expect(g.requiredDone).toBe(0);
    expect(g.steps[0]?.detail).toMatch(/sample job does not count/);

    const job = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Clinic", gcName: "Harbor Builders", originalContractSumCents: 2_000_000 },
    });
    const base = `/api/orgs/${orgId}/projects/${job.id}`;
    g = await call<GettingStarted>(path, { as });
    expect(done(g)).toMatchObject({ job: true, sov: false });
    expect(g.steps[1]?.target).toEqual({ page: "project", projectId: job.id });

    const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 2_000_000 }] },
    });
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    g = await call<GettingStarted>(path, { as });
    expect(done(g)).toMatchObject({ sov: true, "pay-app": true, send: false });
    expect(g.steps[3]?.target).toEqual({ page: "pay-app", projectId: job.id, payAppId: app.id });

    await call(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId: p.sovLines[0]?.id ?? "",
            workThisPeriodCents: 1_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
    g = await call<GettingStarted>(path, { as });
    expect(done(g)).toMatchObject({ send: true, paid: false });

    await call(`${base}/pay-apps/${app.id}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 400_000, receivedOn: "2026-02-20", reference: "1042" },
    });
    g = await call<GettingStarted>(path, { as });
    expect(g).toMatchObject({ requiredDone: 5, complete: true });
    expect(done(g)).toMatchObject({ team: false, quickbooks: false });

    const pm = await createTestUser();
    await addToOrg(orgId, pm.id, "editor");
    g = await call<GettingStarted>(path, { as: pm.id });
    expect(done(g).team).toBe(true);
  });

  it("is readable by viewers and never shows another company's work", async () => {
    const a = await setupTenant("owner");
    await call(`/api/orgs/${a.orgId}/projects`, {
      method: "POST",
      as: a.userId,
      expect: 201,
      json: { name: "A job", gcName: "GC", originalContractSumCents: 100_000 },
    });
    const viewer = await createTestUser();
    await addToOrg(a.orgId, viewer.id, "viewer");
    const g = await call<GettingStarted>(`/api/orgs/${a.orgId}/getting-started`, {
      as: viewer.id,
    });
    expect(done(g).job).toBe(true);

    const b = await setupTenant("owner");
    const other = await call<GettingStarted>(`/api/orgs/${b.orgId}/getting-started`, {
      as: b.userId,
    });
    expect(done(other).job).toBe(false);
    const res = await api(`/api/orgs/${a.orgId}/getting-started`, { as: b.userId });
    expect(res.status).toBe(404);
  });
});
