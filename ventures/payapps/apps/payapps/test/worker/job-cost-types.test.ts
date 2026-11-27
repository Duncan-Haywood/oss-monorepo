// Budget by cost type (PUT /projects/:projectId/job-cost/cost-type-budgets, and the split a won
// estimate starts the job with): saved per line and type, the line's budget set to the split's sum,
// costs compared type by type, cleared with the line's budget; Crew and up to change, viewers read,
// and no reach into another company's job.
import type { EstimateDetailDto, JobCostDto, ProjectDto } from "@shared/api/types";
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
    json: { name: "Mesa Clinic TI", gcName: "Copper State", originalContractSumCents: 10_000_000 },
  });
  const base = `/api/orgs/${t.orgId}/projects/${p.id}`;
  const d = await call<{ sovLines: { id: string }[] }>(`${base}/sov-lines/bulk`, {
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
  return { ...t, as, jc: `${base}/job-cost`, a, b };
}

describe("budget by cost type", () => {
  it("saves a split, sets the line's budget to its sum and compares costs by type", async () => {
    const { jc, as, a, b } = await job();
    await call(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 4_000_000, costToCompleteCents: 3_000_000 }] },
    });
    const d = await call<JobCostDto>(`${jc}/cost-type-budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, split: { labor: 2_500_000, material: 1_800_000 } }] },
    });
    const line = d.report.lines.find((l) => l.sovLineId === a);
    expect(line?.budgetCents).toBe(4_300_000);
    // The cost to complete is kept, as a budget change keeps it.
    expect(line?.costToCompleteCents).toBe(3_000_000);
    expect(d.costTypeSplits[a]).toEqual({ labor: 2_500_000, material: 1_800_000 });

    await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          { sovLineId: a, incurredOn: "2026-10-01", category: "labor", amountCents: 2_600_000 },
          { sovLineId: a, incurredOn: "2026-10-02", category: "material", amountCents: 900_000 },
          { sovLineId: b, incurredOn: "2026-10-02", category: "material", amountCents: 10_000 },
        ],
      },
    });
    const after = await call<JobCostDto>(jc, { as });
    const ct = after.costTypes.lines.find((l) => l.sovLineId === a);
    expect(
      ct?.rows.map((r) => [r.category, r.budgetCents, r.costToDateCents, r.overBudget]),
    ).toEqual([
      ["labor", 2_500_000, 2_600_000, true],
      ["material", 1_800_000, 900_000, false],
    ]);
    expect(after.costTypes.issues.map((i) => i.message)).toEqual([
      "Line 1 (Rough-in): labor is $1,000.00 over its $25,000.00 budget.",
    ]);
    // Line 2 is not split: its costs by type are listed, not judged.
    expect(after.costTypes.lines.find((l) => l.sovLineId === b)?.split).toBe(false);

    // The line's budget changed alone: the difference shows, the split stays.
    await call(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 4_500_000 }] },
    });
    const changed = await call<JobCostDto>(jc, { as });
    expect(changed.costTypes.lines.find((l) => l.sovLineId === a)?.unsplitCents).toBe(200_000);
    const csv = await (await api(`${jc}/job-cost.csv`, { as })).text();
    expect(csv).toContain("Item,Cost type,Budget,Cost to date,Remaining,Cost % of budget");
    expect(csv).toContain("1,Labor,25000,26000,-1000,104");
    expect(csv).toContain("1,Not split (line budget changed since),2000");

    // Clearing the split keeps the line's budget; clearing the budget clears the split.
    const cleared = await call<JobCostDto>(`${jc}/cost-type-budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, split: null }] },
    });
    expect(cleared.costTypeSplits[a]).toBeUndefined();
    expect(cleared.report.lines.find((l) => l.sovLineId === a)?.budgetCents).toBe(4_500_000);
    await call(`${jc}/cost-type-budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, split: { other: 100 } }] },
    });
    const gone = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: null }] },
    });
    expect(gone.costTypeSplits[a]).toBeUndefined();
  });

  it("refuses bad input, the Free plan, viewers and other companies", async () => {
    const { jc, as, a, orgId } = await job();
    for (const json of [
      { lines: [{ sovLineId: a, split: { labor: -1 } }] },
      { lines: [{ sovLineId: a, split: { overhead: 5 } }] },
      { lines: [{ sovLineId: "sov_nope", split: { labor: 5 } }] },
      {
        lines: [
          { sovLineId: a, split: { labor: 5 } },
          { sovLineId: a, split: null },
        ],
      },
    ]) {
      expect((await api(`${jc}/cost-type-budgets`, { method: "PUT", as, json })).status).toBe(400);
    }
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const json = { lines: [{ sovLineId: a, split: { labor: 5 } }] };
    expect(
      (await api(`${jc}/cost-type-budgets`, { method: "PUT", as: viewer.id, json })).status,
    ).toBe(403);
    const outsider = await setupTenant("owner");
    await grantPlan(outsider.orgId, "crew", "active");
    const theirs = jc.replace(orgId, outsider.orgId);
    expect(
      (await api(`${theirs}/cost-type-budgets`, { method: "PUT", as: outsider.userId, json }))
        .status,
    ).toBe(404);
    expect((await call<JobCostDto>(jc, { as })).costTypeSplits).toEqual({});

    const free = await job(null);
    const res = await api(`${free.jc}/cost-type-budgets`, {
      method: "PUT",
      as: free.as,
      json: { lines: [{ sovLineId: free.a, split: { labor: 5 } }] },
    });
    expect(res.status).toBe(402);
  });

  it("starts a won estimate's job split the way it was bid", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId, "crew", "active");
    const as = t.userId;
    const eb = `/api/orgs/${t.orgId}/estimates`;
    const e = await call<EstimateDetailDto>(eb, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Riverside Clinic",
        gcName: "Harbor",
        materialTaxBps: 750,
        laborMarkupBps: 1500,
      },
    });
    await call(`${eb}/${e.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            bidItem: "Ductwork",
            category: "labor",
            description: "Crew",
            quantityMilli: 120_000,
            unit: "HR",
            unitCostMicros: 68_500_000,
          },
          {
            bidItem: "Ductwork",
            category: "material",
            description: "Duct",
            quantityMilli: 1_450_000,
            unit: "LB",
            unitCostMicros: 4_875_000,
          },
          {
            bidItem: "Equipment setting",
            category: "subcontract",
            description: "Crane",
            quantityMilli: 1_000,
            unit: "LS",
            unitCostMicros: 3_200_000_000,
          },
        ],
      },
    });
    const won = await call<{ project: { id: string } }>(`${eb}/${e.id}/win`, {
      method: "POST",
      as,
      expect: 201,
      json: {},
    });
    const d = await call<JobCostDto>(`/api/orgs/${t.orgId}/projects/${won.project.id}/job-cost`, {
      as,
    });
    const [duct, setting] = d.report.lines;
    // Labor 8,220.00; material 7,068.75 + tax 530.16; the budget is the split's sum, unchanged.
    expect(d.costTypeSplits[duct?.sovLineId ?? ""]).toEqual({ labor: 822_000, material: 759_891 });
    expect(duct?.budgetCents).toBe(1_581_891);
    expect(d.costTypeSplits[setting?.sovLineId ?? ""]).toEqual({ subcontract: 320_000 });
    expect(d.costTypes.splitLineCount).toBe(2);
    expect(d.costTypes.lines.every((l) => l.unsplitCents === null)).toBe(true);
  });
});
