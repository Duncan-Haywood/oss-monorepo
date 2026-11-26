// The GC billing contact on a job (accounts payable): saved through the project API, validated,
// carried into the cash report that the follow-up drafts are written from, and editor-only.
import type { ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, setupTenant } from "./helpers";

async function job(orgId: string, as: string, extra: Record<string, unknown> = {}) {
  return call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Clinic TI",
      gcName: "Harbor Builders",
      originalContractSumCents: 100_000,
      ...extra,
    },
  });
}

describe("GC billing contact", () => {
  it("is set on the new-job form, changed and cleared on the job, and reaches the cash report", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const created = await job(orgId, as, {
      gcBillingName: "Pat Lee",
      gcBillingEmail: "ap@harborbuilders.com",
    });
    expect(created.gcBillingName).toBe("Pat Lee");
    expect(created.gcBillingEmail).toBe("ap@harborbuilders.com");
    const base = `/api/orgs/${orgId}/projects/${created.id}`;

    const changed = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { gcBillingName: "Accounts Payable", gcBillingEmail: " payables@harbor.example " },
    });
    expect(changed.gcBillingEmail).toBe("payables@harbor.example");

    let report = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    const row = report.projects.find((p) => p.id === created.id);
    expect(row?.gcBillingName).toBe("Accounts Payable");
    expect(row?.gcBillingEmail).toBe("payables@harbor.example");

    // A blank field clears it.
    const cleared = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { gcBillingName: null, gcBillingEmail: "" },
    });
    expect(cleared.gcBillingName).toBeNull();
    expect(cleared.gcBillingEmail).toBeNull();
    report = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    expect(report.projects.find((p) => p.id === created.id)?.gcBillingEmail).toBeNull();
  });

  it("refuses an address that is not one, including one that would add a recipient", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const created = await job(orgId, as);
    expect(created.gcBillingEmail).toBeNull();
    const base = `/api/orgs/${orgId}/projects/${created.id}`;
    for (const bad of [
      "not an email",
      "a@b.com,c@d.com",
      "a@b.com?cc=c@d.com",
      "a@b.com\nBcc: x@y.com",
    ]) {
      const res = await api(base, { as, method: "PATCH", json: { gcBillingEmail: bad } });
      expect(res.status, bad).toBe(400);
    }
  });

  it("only editors change it, and only in their own company", async () => {
    const owner = await setupTenant("owner");
    const created = await job(owner.orgId, owner.userId);
    const viewer = await setupTenant("owner");
    await addToOrg(owner.orgId, viewer.userId, "viewer");
    const outsider = await setupTenant("owner");
    const base = `/api/orgs/${owner.orgId}/projects/${created.id}`;
    const patch = (as: string) =>
      api(base, { as, method: "PATCH", json: { gcBillingEmail: "x@y.com" } }).then((r) => r.status);
    expect(await patch(viewer.userId)).toBe(403);
    expect(await patch(outsider.userId)).toBe(404);
    const still = await call<ProjectDto>(base, { as: owner.userId });
    expect(still.gcBillingEmail).toBeNull();
  });
});
