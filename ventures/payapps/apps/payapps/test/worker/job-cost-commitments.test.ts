// Committed costs on a job (/projects/:projectId/job-cost/commitments): purchase orders and lower-tier
// subcontracts saved, costs entered against them, the open amount flooring the line's estimate, the
// CSV, deleting one keeping its costs, the plan gate, and no reach into another company's job or its
// commitments.
import type { JobCostDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

async function job(plan: string | null = "crew") {
  const t = await setupTenant("owner");
  if (plan) await grantPlan(t.orgId, plan, "active");
  const as = t.userId;
  const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      gcName: "Copper State Builders",
      originalContractSumCents: 10_000_000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Rough-in", originalCents: 6_000_000 },
        { itemNumber: "2", description: "Trim", originalCents: 4_000_000 },
      ],
    },
  });
  const [a, b] = d.sovLines.map((l) => l.id) as [string, string];
  const jc = `${base}/job-cost`;
  if (!plan) return { ...t, as, jc, a, b };
  await call(`${jc}/budgets`, {
    method: "PUT",
    as,
    json: {
      lines: [
        { sovLineId: a, budgetCents: 4_500_000 },
        { sovLineId: b, budgetCents: 3_000_000 },
      ],
    },
  });
  return { ...t, as, jc, a, b };
}

const sub = (sovLineId: string | null, amountCents: number) => ({
  sovLineId,
  kind: "subcontract",
  category: "subcontract",
  vendor: "Desert Insulation LLC",
  reference: "SC-104",
  committedOn: "2026-10-01",
  amountCents,
});

describe("committed costs", () => {
  it("floors the estimate at cost plus open commitments and reports each commitment", async () => {
    const { as, jc, b } = await job();
    const { id } = await call<{ id: string }>(`${jc}/commitments`, {
      method: "POST",
      as,
      expect: 201,
      json: sub(b, 3_500_000),
    });
    await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          {
            sovLineId: b,
            incurredOn: "2026-10-20",
            category: "subcontract",
            amountCents: 1_000_000,
            commitmentId: id,
          },
        ],
      },
    });
    const d = await call<JobCostDto>(jc, { as });
    const lb = d.report.lines.find((l) => l.sovLineId === b);
    // 10,000 invoiced of 35,000: 25,000 open; 10,000 + 25,000 = 35,000 > the 30,000 budget.
    expect(lb).toMatchObject({
      committedCents: 3_500_000,
      openCommittedCents: 2_500_000,
      estimateBasis: "committed",
      estimateAtCompletionCents: 3_500_000,
    });
    expect(d.report.totals.estimateAtCompletionCents).toBe(8_000_000);
    expect(d.report.totals.openCommittedCents).toBe(2_500_000);
    expect(d.commitments).toHaveLength(1);
    expect(d.commitments[0]).toMatchObject({
      id,
      vendor: "Desert Insulation LLC",
      invoicedCents: 1_000_000,
      openCents: 2_500_000,
    });
    expect(d.entries[0]?.commitmentId).toBe(id);
    expect(d.report.issues.map((i) => i.code)).toContain("committed_over_estimate_line");

    const csv = await (await api(`${jc}/job-cost.csv`, { as })).text();
    expect(csv).toContain("Open commitments");
    expect(csv).toContain(
      "Subcontract,SC-104,Desert Insulation LLC,2,Subcontract,2026-10-01,35000,10000,25000",
    );
    expect(csv).toContain("Desert Insulation LLC SC-104");

    // A change order to the subcontract is a new amount.
    await call(`${jc}/commitments/${id}`, {
      method: "PATCH",
      as,
      json: { amountCents: 2_000_000 },
    });
    const lower = await call<JobCostDto>(jc, { as });
    expect(lower.report.lines.find((l) => l.sovLineId === b)?.estimateBasis).toBe("budget");

    // Deleting it keeps the cost, against no commitment.
    await call(`${jc}/commitments/${id}`, { method: "DELETE", as });
    const gone = await call<JobCostDto>(jc, { as });
    expect(gone.commitments).toEqual([]);
    expect(gone.entries).toHaveLength(1);
    expect(gone.entries[0]?.commitmentId).toBeNull();
    expect(gone.report.totals.openCommittedCents).toBe(0);
  });

  it("links and unlinks a cost, and refuses a commitment or line from another job", async () => {
    const { as, jc, a } = await job();
    const other = await job();
    const { id } = await call<{ id: string }>(`${jc}/commitments`, {
      method: "POST",
      as,
      expect: 201,
      json: sub(null, 50_000),
    });
    const theirs = await call<{ id: string }>(`${other.jc}/commitments`, {
      method: "POST",
      as: other.as,
      expect: 201,
      json: sub(null, 50_000),
    });
    await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          { sovLineId: a, incurredOn: "2026-10-02", category: "material", amountCents: 9_000 },
        ],
      },
    });
    const [entry] = (await call<JobCostDto>(jc, { as })).entries;
    const linked = await call<{ commitmentId: string | null }>(`${jc}/entries/${entry?.id}`, {
      method: "PATCH",
      as,
      json: { commitmentId: id },
    });
    expect(linked.commitmentId).toBe(id);
    const unlinked = await call<{ commitmentId: string | null }>(`${jc}/entries/${entry?.id}`, {
      method: "PATCH",
      as,
      json: { commitmentId: null },
    });
    expect(unlinked.commitmentId).toBeNull();

    const foreign = await api(`${jc}/entries`, {
      method: "POST",
      as,
      json: {
        entries: [
          {
            sovLineId: null,
            incurredOn: "2026-10-02",
            category: "material",
            amountCents: 5,
            commitmentId: theirs.id,
          },
        ],
      },
    });
    expect(foreign.status).toBe(400);
    expect(
      (
        await api(`${jc}/entries/${entry?.id}`, {
          method: "PATCH",
          as,
          json: { commitmentId: theirs.id },
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(`${jc}/commitments`, { method: "POST", as, json: sub(other.a, 1) })).status,
    ).toBe(400);
    // Another job's commitment id through this job's path: not found.
    expect((await api(`${jc}/commitments/${theirs.id}`, { method: "DELETE", as })).status).toBe(
      404,
    );
    expect(
      (
        await api(`${jc}/commitments/${theirs.id}`, {
          method: "PATCH",
          as,
          json: { amountCents: 1 },
        })
      ).status,
    ).toBe(404);
    // Validation: a vendor and an amount above 0.
    expect(
      (await api(`${jc}/commitments`, { method: "POST", as, json: { ...sub(a, 0) } })).status,
    ).toBe(400);
    expect(
      (await api(`${jc}/commitments`, { method: "POST", as, json: { ...sub(a, 5), vendor: " " } }))
        .status,
    ).toBe(400);
  });

  it("needs Crew to add one, an editor to change one, and keeps other companies out", async () => {
    const free = await job(null);
    expect(
      (await api(`${free.jc}/commitments`, { method: "POST", as: free.as, json: sub(null, 5) }))
        .status,
    ).toBe(402);

    const { jc, orgId } = await job();
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<JobCostDto>(jc, { as: viewer.id })).commitments).toEqual([]);
    expect(
      (await api(`${jc}/commitments`, { method: "POST", as: viewer.id, json: sub(null, 5) }))
        .status,
    ).toBe(403);

    const outsider = await setupTenant("owner");
    await grantPlan(outsider.orgId, "crew", "active");
    const projectPath = jc.replace(orgId, outsider.orgId);
    expect(
      (
        await api(`${projectPath}/commitments`, {
          method: "POST",
          as: outsider.userId,
          json: sub(null, 5),
        })
      ).status,
    ).toBe(404);
  });
});
