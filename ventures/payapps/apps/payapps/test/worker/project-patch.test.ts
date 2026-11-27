// PATCH /projects/:id changes only the fields sent. Regression: in zod 4 the create schema's
// retainage defaults (10%) filled in through .partial(), so turning on the notary block, setting pay
// terms or the GC billing contact reset a 5% job to 10% on work and stored materials.
import type { ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { call, setupTenant } from "./helpers";

describe("project PATCH", () => {
  it("keeps both retainage rates when other fields change", async () => {
    const t = await setupTenant("owner");
    const as = t.userId;
    const job = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "County Library",
        gcName: "Harbor Builders",
        originalContractSumCents: 1_000_000,
        retainagePctBps: 500,
        storedRetainagePctBps: 250,
      },
    });
    expect(job).toMatchObject({ retainagePctBps: 500, storedRetainagePctBps: 250 });
    const base = `/api/orgs/${t.orgId}/projects/${job.id}`;
    const patches: Record<string, unknown>[] = [
      { notaryBlock: true },
      { payTermsDays: 30, payTermsBasis: "application_date", payTermsOuterDays: null },
      { gcBillingName: "Accounts Payable", gcBillingEmail: "ap@example.com" },
      { name: "County Library, Phase 2" },
    ];
    for (const json of patches) {
      const after = await call<ProjectDto>(base, { method: "PATCH", as, json });
      expect(after, JSON.stringify(json)).toMatchObject({
        retainagePctBps: 500,
        storedRetainagePctBps: 250,
      });
    }
    // Changing one rate leaves the other alone.
    const work = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { retainagePctBps: 1000 },
    });
    expect(work).toMatchObject({ retainagePctBps: 1000, storedRetainagePctBps: 250 });
    // Closing the job keeps them too (and frees the Free plan's one active job).
    const closed = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { status: "closed" },
    });
    expect(closed).toMatchObject({
      status: "closed",
      retainagePctBps: 1000,
      storedRetainagePctBps: 250,
    });
    // A new job without rates still gets 10% on both.
    const fresh = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Fire Station", gcName: "Harbor Builders", originalContractSumCents: 100_000 },
    });
    expect(fresh).toMatchObject({ retainagePctBps: 1000, storedRetainagePctBps: 1000 });
  });
});
