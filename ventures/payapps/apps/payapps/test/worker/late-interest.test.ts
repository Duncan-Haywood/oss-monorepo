// Late-payment interest through the HTTP API on a real local D1: the rate saved on a job (PATCH), the
// cap checked against the rate's period as it will be saved, and the cash report's accrued interest on
// a past-due application net of a partial payment.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { lateInterest } from "@shared/late-interest";
import { describe, expect, it } from "vitest";
import { call, setupTenant } from "./helpers";

// A $100,000 job, net 30, 10% retainage; #1 dated 2026-01-31 bills $50,000 (line 8 $45,000).
async function lateJob() {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      payTermsDays: 30,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  const appPath = `${base}/pay-apps/${app.id}`;
  await call(`${appPath}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: project.sovLines[0]?.id ?? "",
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${appPath}/submit`, { method: "POST", as });
  return { orgId, as, base, appPath };
}

describe("late-payment interest", () => {
  it("saves the rate on the job and the cash report accrues it on the unpaid balance", async () => {
    const t = await lateJob();
    let r = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(r.projects[0]?.outstanding[0]?.interestCents).toBeNull();
    expect(r.totals.interestCents).toBe(0);

    const saved = await call<ProjectDetailDto>(t.base, {
      method: "PATCH",
      as: t.as,
      json: {
        lateInterestBps: 150,
        lateInterestPer: "month",
        lateInterestSource: "Subcontract § 5.3",
      },
    });
    expect(saved).toMatchObject({
      lateInterestBps: 150,
      lateInterestPer: "month",
      lateInterestMethod: "prorata",
      lateInterestSource: "Subcontract § 5.3",
    });

    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_500_000, receivedOn: "2026-03-12" },
    });
    r = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    const terms = { bps: 150, per: "month" as const, method: "prorata" as const, source: null };
    const want = lateInterest(
      terms,
      "2026-03-02",
      4_500_000,
      [{ amountCents: 1_500_000, receivedOn: "2026-03-12" }],
      r.asOf,
    )?.interestCents;
    expect(want).toBeGreaterThan(0);
    expect(r.projects[0]?.outstanding[0]).toMatchObject({
      dueOn: "2026-03-02",
      amountCents: 3_000_000,
      interestCents: want,
    });
    expect(r.projects[0]?.interestCents).toBe(want);
    expect(r.projects[0]?.lateInterest).toMatchObject({ bps: 150, source: "Subcontract § 5.3" });
    expect(r.totals.interestCents).toBe(want);
  });

  it("caps a monthly rate lower than a yearly one, checked against the saved period", async () => {
    const t = await lateJob();
    await call(t.base, {
      method: "PATCH",
      as: t.as,
      expect: 400,
      json: { lateInterestBps: 1000, lateInterestPer: "month" },
    });
    await call(t.base, {
      method: "PATCH",
      as: t.as,
      json: { lateInterestBps: 1000, lateInterestPer: "year" },
    });
    // Switching the saved 10% a year to a month is refused too: the pair is checked as it will be saved.
    await call(t.base, {
      method: "PATCH",
      as: t.as,
      expect: 400,
      json: { lateInterestPer: "month" },
    });
    const cleared = await call<ProjectDetailDto>(t.base, {
      method: "PATCH",
      as: t.as,
      json: { lateInterestBps: null, lateInterestSource: null },
    });
    expect(cleared.lateInterestBps).toBeNull();
  });
});
