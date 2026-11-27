// Pay-when-paid terms through the HTTP API on a real local D1: a job whose pay terms count from the
// owner's payment to the GC; each sent application records that day (PUT .../owner-paid), the cash
// report has no due date until it is recorded and counts the days from it after; the history row;
// the refusals (draft, other terms, future date, before the period); roles and tenancy.
import type {
  PayAppDetailDto,
  PayAppEventDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

// A $100,000 job, 10% retainage, 7 days after the owner pays; #1 bills $50,000 (line 8 $45,000).
async function payWhenPaidJob(submit = true) {
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
      payTermsDays: 7,
      payTermsBasis: "owner_paid",
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
  await call(`${base}/pay-apps/${app.id}/lines`, {
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
  if (submit) await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  return { orgId, as, base, appPath: `${base}/pay-apps/${app.id}` };
}

const cash = (orgId: string, as: string) =>
  call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });

describe("pay-when-paid terms", () => {
  it("has no due date until the owner's payment is recorded, then counts from it", async () => {
    const t = await payWhenPaidJob();
    const project = await call<ProjectDetailDto>(t.base, { as: t.as });
    expect(project).toMatchObject({ payTermsDays: 7, payTermsBasis: "owner_paid" });

    let r = await cash(t.orgId, t.as);
    expect(r.projects[0]?.outstanding[0]).toMatchObject({
      amountCents: 4_500_000,
      dueOn: null,
      ownerPaidOn: null,
      awaitingOwner: true,
    });
    expect(r.totals).toMatchObject({ awaitingOwnerCents: 4_500_000, pastDueCents: 0 });
    expect(r.projects[0]?.actions.join(" ")).toMatch(
      /no payment from the owner to Harbor Builders is recorded/,
    );

    const d = await call<PayAppDetailDto>(`${t.appPath}/owner-paid`, {
      method: "PUT",
      as: t.as,
      json: { ownerPaidOn: "2026-02-10" },
    });
    expect(d.ownerPaidOn).toBe("2026-02-10");
    r = await cash(t.orgId, t.as);
    expect(r.projects[0]?.outstanding[0]).toMatchObject({
      dueOn: "2026-02-17",
      ownerPaidOn: "2026-02-10",
      awaitingOwner: false,
    });
    expect(r.totals.awaitingOwnerCents).toBe(0);
    expect(r.totals.pastDueCents).toBe(4_500_000);
    expect(r.projects[0]?.actions.join(" ")).toMatch(
      /#1 was due on 2026-02-17 \(7 days after the owner pays the GC\)/,
    );

    const csv = await api(`/api/orgs/${t.orgId}/reports/cash.csv`, { as: t.as });
    const text = await csv.text();
    expect(text).toContain("owner's payment to the GC");
    expect(text).toContain("Waiting on the owner's payment (pay-when-paid)");

    const items = await call<{ items: PayAppEventDto[] }>(`${t.appPath}/history`, {
      as: t.as,
    }).then((h) => h.items);
    expect(items[0]).toMatchObject({
      action: "owner_payment_recorded",
      text: "Owner's payment to the GC for application #1 recorded as 2026-02-10",
    });

    // Clearing it puts the application back to waiting; the history names the old date.
    const cleared = await call<PayAppDetailDto>(`${t.appPath}/owner-paid`, {
      method: "PUT",
      as: t.as,
      json: { ownerPaidOn: null },
    });
    expect(cleared.ownerPaidOn).toBeNull();
    r = await cash(t.orgId, t.as);
    expect(r.totals.awaitingOwnerCents).toBe(4_500_000);
    const after = await call<{ items: PayAppEventDto[] }>(`${t.appPath}/history`, {
      as: t.as,
    }).then((h) => h.items);
    expect(after[0]?.text).toBe("Owner's payment date (2026-02-10) cleared from application #1");
    // Saving the same value again writes no row.
    await call(`${t.appPath}/owner-paid`, { method: "PUT", as: t.as, json: { ownerPaidOn: null } });
    const again = await call<{ items: PayAppEventDto[] }>(`${t.appPath}/history`, {
      as: t.as,
    }).then((h) => h.items);
    expect(again).toHaveLength(after.length);
  });

  it("refuses a draft, a job on other terms, a future date and a date before the period", async () => {
    const draft = await payWhenPaidJob(false);
    const put = (path: string, as: string, ownerPaidOn: string | null) =>
      api(`${path}/owner-paid`, { method: "PUT", as, json: { ownerPaidOn } });
    expect((await put(draft.appPath, draft.as, "2026-02-10")).status).toBe(409);

    const t = await payWhenPaidJob();
    expect((await put(t.appPath, t.as, "2099-01-01")).status).toBe(409);
    expect((await put(t.appPath, t.as, "2025-12-31")).status).toBe(409);
    expect((await put(t.appPath, t.as, "not a date")).status).toBe(400);

    await call(t.base, {
      method: "PATCH",
      as: t.as,
      json: { payTermsDays: 30, payTermsBasis: "application_date" },
    });
    const res = await put(t.appPath, t.as, "2026-02-10");
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/pay-when-paid/);
    expect((await call<PayAppDetailDto>(t.appPath, { as: t.as })).ownerPaidOn).toBeNull();
  });

  it("viewers cannot record it; another org cannot touch it", async () => {
    const t = await payWhenPaidJob();
    const json = { ownerPaidOn: "2026-02-10" };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect(
      (await api(`${t.appPath}/owner-paid`, { method: "PUT", as: viewer.id, json })).status,
    ).toBe(403);
    const other = await setupTenant("owner");
    expect(
      (await api(`${t.appPath}/owner-paid`, { method: "PUT", as: other.userId, json })).status,
    ).toBe(404);
    const crossPath = t.appPath.replace(t.orgId, other.orgId);
    expect(
      (await api(`${crossPath}/owner-paid`, { method: "PUT", as: other.userId, json })).status,
    ).toBe(404);
    expect((await call<PayAppDetailDto>(t.appPath, { as: t.as })).ownerPaidOn).toBeNull();
  });
});

describe("pay-when-paid outer limit", () => {
  it("is saved on the job, dates an application with no owner payment and goes in the CSV", async () => {
    const t = await payWhenPaidJob();
    const project = await call<ProjectDto>(t.base, {
      method: "PATCH",
      as: t.as,
      json: { payTermsOuterDays: 45 },
    });
    expect(project).toMatchObject({ payTermsBasis: "owner_paid", payTermsOuterDays: 45 });
    const r = await cash(t.orgId, t.as);
    // Application 01-31 + 45 days.
    expect(r.projects[0]?.outstanding[0]).toMatchObject({
      dueOn: "2026-03-17",
      awaitingOwner: false,
      dueByOuterLimit: true,
    });
    expect(r.projects[0]?.payTermsOuterDays).toBe(45);
    expect(r.totals.awaitingOwnerCents).toBe(0);
    const text = await (await api(`/api/orgs/${t.orgId}/reports/cash.csv`, { as: t.as })).text();
    expect(text).toContain("Pay-when-paid outer limit (days from the application date)");
  });

  it("refuses 0 and more than 365 days", async () => {
    const t = await payWhenPaidJob(false);
    for (const payTermsOuterDays of [0, 366, 1.5]) {
      await call(t.base, { method: "PATCH", as: t.as, expect: 400, json: { payTermsOuterDays } });
    }
  });
});
