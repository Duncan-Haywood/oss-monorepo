// The one-click sample job (real local D1).
import type { PayAppDetailDto, PayAppDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { SAMPLE_PROJECT_NAME } from "@shared/sample-job";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let sample: ProjectDto;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  sample = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
    method: "POST",
    as,
    expect: 201,
  });
});

describe("sample job", () => {
  it("is a full job three months in, built by the real rules", async () => {
    expect(sample).toMatchObject({ name: SAMPLE_PROJECT_NAME, isSample: true, status: "active" });
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    const p = await call<ProjectDetailDto>(base, { as });
    expect(p.sovLines).toHaveLength(8); // seven original lines and CO-1's
    expect(p.sovLines[0]?.retainagePctBps).toBe(0); // the bond line
    expect(p.changeOrders.map((co) => [co.number, co.status])).toEqual([
      ["CO-1", "approved"],
      ["CO-2", "pending"],
    ]);
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    expect(apps.map((a) => a.status)).toEqual(["paid", "certified", "submitted", "draft"]);
    // No history: nobody did these things.
    const h = await call<{ items: unknown[] }>(`${base}/pay-apps/history`, { as });
    expect(h.items).toHaveLength(0);
  });

  it("does not count toward the Free plan's one active job", async () => {
    // Free allows one active job: a real one still fits beside the sample, and bills.
    const real = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Real job", gcName: "Real GC", originalContractSumCents: 1_000_000 },
    });
    expect(real.isSample).toBe(false);
    await call(`/api/orgs/${orgId}/projects/${real.id}/sov-lines`, {
      method: "POST",
      as,
      expect: 201,
      json: { itemNumber: "1", description: "Work", originalCents: 1_000_000 },
    });
    await call(`/api/orgs/${orgId}/projects/${real.id}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    // A second real one does not.
    const res = await api(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      json: { name: "Second", gcName: "GC", originalContractSumCents: 1 },
    });
    expect(res.status).toBe(402);
    // Closing and reopening the sample is not blocked by the real job.
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    await call(base, { method: "PATCH", as, json: { status: "closed" } });
    await call(base, { method: "PATCH", as, json: { status: "active" } });
  });

  it("is one per company: asking again returns the same job", async () => {
    const again = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
    });
    expect(again.id).toBe(sample.id);
  });

  it("marks every PDF page SAMPLE DATA", async () => {
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    const res = await api(`${base}/pay-apps/${apps[0]?.id}/application.pdf`, { as });
    expect(res.status).toBe(200);
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(text.split("SAMPLE DATA - NOT A REAL APPLICATION").length - 1).toBe(pages);
  });

  it("marks the CSVs and every change order PDF page too", async () => {
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    for (const file of ["summary.csv", "continuation.csv"]) {
      const res = await api(`${base}/pay-apps/${apps[0]?.id}/${file}`, { as });
      expect(await res.text()).toContain("SAMPLE DATA - NOT A REAL APPLICATION");
    }
    const p = await call<ProjectDetailDto>(base, { as });
    for (const co of p.changeOrders) {
      const res = await api(`${base}/change-orders/${co.id}/request.pdf`, { as });
      expect(res.status).toBe(200);
      const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
      const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
      expect(pages).toBeGreaterThan(0);
      expect(text.split("SAMPLE DATA - NOT A REAL CHANGE ORDER").length - 1).toBe(pages);
    }
  });

  it("leaves a real job's exports unmarked", async () => {
    const real = (
      await call<{ items: ProjectDto[] }>(`/api/orgs/${orgId}/projects`, { as })
    ).items.find((j) => !j.isSample);
    const base = `/api/orgs/${orgId}/projects/${real?.id}`;
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    const csv = await (await api(`${base}/pay-apps/${apps[0]?.id}/summary.csv`, { as })).text();
    expect(csv).not.toContain("SAMPLE");
    const pdf = await api(`${base}/pay-apps/${apps[0]?.id}/application.pdf`, { as });
    expect(new TextDecoder("latin1").decode(await pdf.arrayBuffer())).not.toContain("SAMPLE");
  });

  it("gives the cash report something to show: owed, paid short, a change order waiting", async () => {
    const r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    const job = r.projects.find((p) => p.id === sample.id);
    // Application #2's short balance and all of #3.
    expect(job?.outstanding).toHaveLength(2);
    expect(job?.outstanding.find((o) => o.number === 2)?.amountCents).toBe(125_000);
    expect(job?.retainageHeldCents).toBeGreaterThan(0);
    expect(r.totals.pendingChangeCents).toBe(345_000);
    expect(r.totals.pendingChangeOrdersOverdue).toBe(1);
  });

  it("the draft takes this month's entries", async () => {
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    const draft = apps.at(-1);
    const p = await call<ProjectDetailDto>(base, { as });
    const lighting = p.sovLines.find((l) => l.itemNumber === "6");
    const d = await call<PayAppDetailDto>(`${base}/pay-apps/${draft?.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId: lighting?.id,
            workThisPeriodCents: 500_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    expect(d.blockers).toEqual([]);
  });

  it("viewers cannot add it, and another company cannot see it", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const res = await api(`/api/orgs/${orgId}/projects/sample`, { method: "POST", as: viewer.id });
    expect(res.status).toBe(403);
    const other = await setupTenant("owner");
    const cross = await api(`/api/orgs/${orgId}/projects/${sample.id}`, { as: other.userId });
    expect([403, 404]).toContain(cross.status);
    const own = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects/sample`, {
      method: "POST",
      as: other.userId,
      expect: 201,
    });
    expect(own.id).not.toBe(sample.id);
  });

  it("is never sent to QuickBooks", async () => {
    const base = `/api/orgs/${orgId}/projects/${sample.id}`;
    const apps = (await call<{ items: PayAppDto[] }>(`${base}/pay-apps`, { as })).items;
    const res = await api(`${base}/pay-apps/${apps[0]?.id}/quickbooks`, { method: "POST", as });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("never sent to QuickBooks");
  });

  it("removes cleanly, and can be added again", async () => {
    await call(`/api/orgs/${orgId}/projects/${sample.id}`, { method: "DELETE", as });
    const gone = await api(`/api/orgs/${orgId}/projects/${sample.id}`, { as });
    expect(gone.status).toBe(404);
    const again = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
      expect: 201,
    });
    expect(again.id).not.toBe(sample.id);
  });
});
