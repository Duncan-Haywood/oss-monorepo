// Job costing (/projects/:projectId/job-cost and /reports/wip): budgets and costs saved, the report
// worked from the latest sent application (a draft never moves it), the plan gate (Crew and up to
// change, readable on every plan), viewers read-only, and no reach into another company's job.
import type {
  JobCostDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  WipReportDto,
} from "@shared/api/types";
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
  return { ...t, as, base, jc: `${base}/job-cost`, a, b, projectId: p.id };
}

async function payApp(
  base: string,
  as: string,
  lines: { sovLineId: string; workThisPeriodCents: number }[],
  periodTo: string,
  submit: boolean,
) {
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: `${periodTo.slice(0, 8)}01`, periodTo, applicationDate: periodTo },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: lines.map((l) => ({ ...l, storedMaterialsCents: 0, retainageReleasedCents: 0 })),
    },
  });
  if (submit) await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  return app;
}

describe("job costing", () => {
  it("works the WIP figures from budgets, costs and the latest sent application", async () => {
    const { as, base, jc, a, b, orgId } = await job();
    const empty = await call<JobCostDto>(jc, { as });
    expect(empty.billedThrough).toBeNull();
    expect(empty.canEdit).toBe(true);
    expect(empty.report.missingBudgetLineIds).toEqual([a, b]);
    expect(empty.report.totals.contractCents).toBe(10_000_000);

    const withBudgets = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: {
        lines: [
          { sovLineId: a, budgetCents: 4_500_000 },
          { sovLineId: b, budgetCents: 3_000_000 },
        ],
      },
    });
    expect(withBudgets.report.totals.estimateAtCompletionCents).toBe(7_500_000);

    const added = await call<{ added: number }>(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          { sovLineId: a, incurredOn: "2026-10-01", category: "labor", amountCents: 1_200_000 },
          {
            sovLineId: a,
            incurredOn: "2026-10-20",
            category: "material",
            amountCents: 800_000,
            vendor: "City Electric",
          },
          {
            sovLineId: b,
            incurredOn: "2026-10-31",
            category: "subcontract",
            amountCents: 1_500_000,
          },
          { sovLineId: b, incurredOn: "2026-11-03", category: "subcontract", amountCents: 500_000 },
          {
            sovLineId: null,
            incurredOn: "2026-09-30",
            category: "other",
            amountCents: 100_000,
            description: "Permit",
          },
        ],
      },
    });
    expect(added.added).toBe(5);

    // October billed and sent; November's draft must not move the figures.
    await payApp(
      base,
      as,
      [
        { sovLineId: a, workThisPeriodCents: 3_000_000 },
        { sovLineId: b, workThisPeriodCents: 1_000_000 },
      ],
      "2026-10-31",
      true,
    );
    await payApp(base, as, [{ sovLineId: a, workThisPeriodCents: 2_000_000 }], "2026-11-30", false);

    const r = await call<JobCostDto>(jc, { as });
    expect(r.billedThrough).toMatchObject({ number: 1, periodTo: "2026-10-31" });
    expect(r.entries).toHaveLength(5);
    expect(r.report.totals).toMatchObject({
      contractCents: 10_000_000,
      billedToDateCents: 4_000_000,
      costToDateCents: 3_600_000,
      costAfterCents: 500_000,
      estimateAtCompletionCents: 7_600_000,
      percentCompleteBps: 4737,
      earnedRevenueCents: 4_736_842,
      overUnderBilledCents: -736_842,
      projectedGrossProfitCents: 2_400_000,
    });

    const wip = await call<WipReportDto>(`/api/orgs/${orgId}/reports/wip`, { as });
    expect(wip.rows).toHaveLength(1);
    expect(wip.incompleteJobs).toBe(0);
    expect(wip.totals).toMatchObject({
      underBilledCents: 736_842,
      overBilledCents: 0,
      earnedRevenueCents: 4_736_842,
    });

    const csv = await api(`/api/orgs/${orgId}/reports/wip.csv`, { as });
    expect(csv.headers.get("Content-Type")).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("Mesa Clinic TI");
    expect(text).toContain("-7368.42");
    const pdf = await api(`/api/orgs/${orgId}/reports/wip.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("wip-schedule-");
    const pdfText = new TextDecoder().decode(await pdf.arrayBuffer());
    expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfText).toContain("(Mesa Clinic TI) Tj");
    expect(pdfText).toContain("(7,368.42) Tj"); // under billed
    const jobCsv = await (await api(`${jc}/job-cost.csv`, { as })).text();
    expect(jobCsv).toContain("City Electric");
  });

  it("edits, clears and deletes; checks the line belongs to the job", async () => {
    const { as, jc, a, b } = await job();
    await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          { sovLineId: a, incurredOn: "2026-10-01", category: "labor", amountCents: 1_000 },
        ],
      },
    });
    const [entry] = (await call<JobCostDto>(jc, { as })).entries;
    if (!entry) throw new Error("no entry");
    const moved = await call(`${jc}/entries/${entry.id}`, {
      method: "PATCH",
      as,
      json: { sovLineId: b, amountCents: -250, vendor: "" },
    });
    expect(moved).toMatchObject({
      sovLineId: b,
      amountCents: -250,
      vendor: null,
      category: "labor",
    });

    const other = await job();
    const bad = await api(`${jc}/entries`, {
      method: "POST",
      as,
      json: {
        entries: [
          { sovLineId: other.a, incurredOn: "2026-10-01", category: "labor", amountCents: 5 },
        ],
      },
    });
    expect(bad.status).toBe(400);
    const zero = await api(`${jc}/entries`, {
      method: "POST",
      as,
      json: {
        entries: [{ sovLineId: null, incurredOn: "2026-10-01", category: "labor", amountCents: 0 }],
      },
    });
    expect(zero.status).toBe(400);

    await call(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 10 }] },
    });
    const cleared = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: null }] },
    });
    expect(cleared.report.lines[0]?.budgetCents).toBeNull();

    await call(`${jc}/entries/${entry.id}`, { method: "DELETE", as });
    expect((await call<JobCostDto>(jc, { as })).entries).toEqual([]);
  });

  it("skips entries whose reference the job already has when asked (a payroll report sent twice)", async () => {
    const { as, jc, a } = await job();
    const payroll = (amountCents: number) => ({
      skipExistingReferences: true,
      entries: [
        {
          sovLineId: a,
          incurredOn: "2026-11-14",
          category: "labor",
          amountCents,
          vendor: "Payroll",
          reference: "Payroll 2026-11-14 item 1",
        },
        { sovLineId: null, incurredOn: "2026-11-14", category: "labor", amountCents: 500 },
      ],
    });
    const first = await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: payroll(300_000),
    });
    expect(first).toEqual({ added: 2, skipped: 0 });
    // Again: the referenced cost is skipped (even with another amount); one with no reference is not.
    const again = await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: payroll(310_000),
    });
    expect(again).toEqual({ added: 1, skipped: 1 });
    const d = await call<JobCostDto>(jc, { as });
    expect(d.entries.filter((e) => e.reference === "Payroll 2026-11-14 item 1")).toHaveLength(1);
    expect(d.entries.find((e) => e.reference)?.amountCents).toBe(300_000);
    // Without the flag nothing is skipped (typed or pasted costs).
    const plain = await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: { entries: [payroll(1).entries[0]] },
    });
    expect(plain).toEqual({ added: 1, skipped: 0 });
    // All skipped: nothing added, still a success.
    const none = await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: { skipExistingReferences: true, entries: [payroll(1).entries[0]] },
    });
    expect(none).toEqual({ added: 0, skipped: 1 });
  });

  it("saves a cost to complete per line, dates it, keeps the date on an unchanged save", async () => {
    const { as, jc, a, b, orgId } = await job();
    await call(`${jc}/entries`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        entries: [
          { sovLineId: a, incurredOn: "2026-10-01", category: "labor", amountCents: 2_000_000 },
        ],
      },
    });
    // A cost to complete needs a budget on the line.
    const noBudget = await api(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: null, costToCompleteCents: 100 }] },
    });
    expect(noBudget.status).toBe(400);

    const saved = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: {
        lines: [
          { sovLineId: a, budgetCents: 4_500_000, costToCompleteCents: 3_000_000 },
          { sovLineId: b, budgetCents: 3_000_000 },
        ],
      },
    });
    const la = saved.report.lines.find((l) => l.sovLineId === a);
    expect(la).toMatchObject({
      estimateBasis: "cost_to_complete",
      costToCompleteCents: 3_000_000,
      estimateAtCompletionCents: 5_000_000,
      estimateVsBudgetCents: 500_000,
      remainingCostCents: 3_000_000,
    });
    expect(la?.costToCompleteOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved.report.totals).toMatchObject({
      estimateAtCompletionCents: 8_000_000,
      estimateVsBudgetCents: 500_000,
      costToCompleteLines: 1,
    });
    expect(saved.report.issues.map((i) => i.code)).toContain("estimate_over_budget_line");

    // Saving the budgets again without the field keeps the cost to complete and its date.
    const again = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 4_600_000 }] },
    });
    const la2 = again.report.lines.find((l) => l.sovLineId === a);
    expect(la2?.costToCompleteCents).toBe(3_000_000);
    expect(la2?.costToCompleteOn).toBe(la?.costToCompleteOn);
    expect(la2?.estimateVsBudgetCents).toBe(400_000);

    const wip = await call<WipReportDto>(`/api/orgs/${orgId}/reports/wip`, { as });
    expect(wip.rows[0]?.totals.estimateAtCompletionCents).toBe(8_000_000);
    const jobCsv = await (await api(`${jc}/job-cost.csv`, { as })).text();
    expect(jobCsv).toContain("Cost to complete (typed)");
    expect(jobCsv).toContain("30000");

    // null clears it: the budget is the estimate again.
    const cleared = await call<JobCostDto>(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 4_500_000, costToCompleteCents: null }] },
    });
    expect(cleared.report.lines.find((l) => l.sovLineId === a)).toMatchObject({
      estimateBasis: "budget",
      costToCompleteCents: null,
      costToCompleteOn: null,
      estimateAtCompletionCents: 4_500_000,
    });
  });

  it("is readable on Free and Solo but changing it needs Crew (402)", async () => {
    const { as, jc, a, orgId } = await job(null);
    const d = await call<JobCostDto>(jc, { as });
    expect(d.canEdit).toBe(false);
    const put = await api(`${jc}/budgets`, {
      method: "PUT",
      as,
      json: { lines: [{ sovLineId: a, budgetCents: 1 }] },
    });
    expect(put.status).toBe(402);
    await grantPlan(orgId, "solo", "active");
    const post = await api(`${jc}/entries`, {
      method: "POST",
      as,
      json: {
        entries: [{ sovLineId: a, incurredOn: "2026-10-01", category: "labor", amountCents: 5 }],
      },
    });
    expect(post.status).toBe(402);
    expect((await call<WipReportDto>(`/api/orgs/${orgId}/reports/wip`, { as })).canEdit).toBe(
      false,
    );
  });

  it("lets viewers read but not change, and keeps other companies out", async () => {
    const { jc, a, orgId } = await job();
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    await call(jc, { as: viewer.id });
    const put = await api(`${jc}/budgets`, {
      method: "PUT",
      as: viewer.id,
      json: { lines: [{ sovLineId: a, budgetCents: 1 }] },
    });
    expect(put.status).toBe(403);

    const outsider = await setupTenant("owner");
    await grantPlan(outsider.orgId, "crew", "active");
    // Not a member: the org is not revealed.
    expect((await api(jc, { as: outsider.userId })).status).toBe(404);
    // Their own org id with this job's id: the job is not theirs.
    const projectPath = jc.replace(orgId, outsider.orgId);
    expect((await api(projectPath, { as: outsider.userId })).status).toBe(404);
    const post = await api(`${projectPath}/entries`, {
      method: "POST",
      as: outsider.userId,
      json: {
        entries: [{ sovLineId: null, incurredOn: "2026-10-01", category: "labor", amountCents: 5 }],
      },
    });
    expect(post.status).toBe(404);
    // The org-wide WIP PDF is not theirs to read either.
    expect((await api(`/api/orgs/${orgId}/reports/wip.pdf`, { as: outsider.userId })).status).toBe(
      404,
    );
    expect((await api(`/api/orgs/${orgId}/reports/wip.pdf`, { as: viewer.id })).status).toBe(200);
  });
});
