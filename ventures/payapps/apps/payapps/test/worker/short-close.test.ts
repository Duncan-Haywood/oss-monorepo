// Closing the balance of an application paid short (a backcharge, a dispute, a write-off) through the
// HTTP API on a real local D1: the application turns paid, the cash report moves the balance out of
// what is owed and into its reason, reopening and deleting a payment undo it; roles and tenancy.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

// A $100,000 job, 10% retainage; application #1 bills $50,000 of work, so line 8 is $45,000.
async function submittedApp() {
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
  const sovLineId = project.sovLines[0]?.id ?? "";
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId,
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  return { orgId, as, base, appPath: `${base}/pay-apps/${app.id}` };
}

const pay = (path: string, as: string, amountCents: number) =>
  call<PayAppDetailDto>(`${path}/payments`, {
    method: "POST",
    as,
    expect: 201,
    json: { amountCents, receivedOn: "2026-02-20" },
  });

describe("closing a balance short", () => {
  let t: Awaited<ReturnType<typeof submittedApp>>;
  beforeEach(async () => {
    t = await submittedApp();
  });

  it("a backcharge closes the balance: paid, out of the aging, counted as backcharged", async () => {
    await pay(t.appPath, t.as, 4_000_000);
    const closed = await call<PayAppDetailDto>(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "backcharge", closedOn: "2026-02-21", note: " Cleanup, GC letter 2/18 " },
    });
    expect(closed).toMatchObject({
      status: "paid",
      expectedCents: 4_500_000,
      paidCents: 4_000_000,
      remainingCents: 0,
      shortClose: {
        cents: 500_000,
        reason: "backcharge",
        note: "Cleanup, GC letter 2/18",
        closedOn: "2026-02-21",
      },
    });
    const report = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(report.totals).toMatchObject({
      paidCents: 4_000_000,
      outstandingCents: 0,
      backchargedCents: 500_000,
      disputedCents: 0,
    });
    const csv = await (await api(`/api/orgs/${t.orgId}/reports/cash.csv`, { as: t.as })).text();
    expect(csv).toContain("Backcharged");
    // No more payments on a closed application.
    const more = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 100, receivedOn: "2026-02-22" },
    });
    expect(more.status).toBe(409);
  });

  it("reopening puts the balance back as owed; a second close is refused while closed", async () => {
    await pay(t.appPath, t.as, 4_000_000);
    await call(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "disputed", closedOn: "2026-02-21" },
    });
    const again = await api(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "disputed", closedOn: "2026-02-21" },
    });
    expect(again.status).toBe(409);
    const report = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(report.totals.disputedCents).toBe(500_000);
    expect(report.projects[0]?.actions.join(" ")).toMatch(/closed as disputed on 2026-02-21/);

    const reopened = await call<PayAppDetailDto>(`${t.appPath}/close-short`, {
      method: "DELETE",
      as: t.as,
    });
    expect(reopened).toMatchObject({
      status: "submitted",
      remainingCents: 500_000,
      shortClose: null,
    });
    const after = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(after.totals).toMatchObject({ outstandingCents: 500_000, disputedCents: 0 });
    // Nothing closed now: reopening again is refused.
    expect((await api(`${t.appPath}/close-short`, { method: "DELETE", as: t.as })).status).toBe(
      409,
    );
  });

  it("deleting a payment from a closed application reopens it and clears the close", async () => {
    const withPayment = await pay(t.appPath, t.as, 4_000_000);
    await call(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "written-off", closedOn: "2026-02-21" },
    });
    const id = withPayment.payments[0]?.id ?? "";
    const reopened = await call<PayAppDetailDto>(`${t.appPath}/payments/${id}`, {
      method: "DELETE",
      as: t.as,
    });
    expect(reopened).toMatchObject({
      status: "submitted",
      remainingCents: 4_500_000,
      shortClose: null,
    });
  });

  it("refuses nothing owed, bad dates and bad reasons", async () => {
    const bad = (json: unknown) =>
      api(`${t.appPath}/close-short`, { method: "POST", as: t.as, json });
    expect((await bad({ reason: "backcharge", closedOn: "2099-01-01" })).status).toBe(409);
    expect((await bad({ reason: "backcharge", closedOn: "2026-01-01" })).status).toBe(409);
    expect((await bad({ reason: "forgiven", closedOn: "2026-02-21" })).status).toBe(400);
    await pay(t.appPath, t.as, 4_500_000); // paid in full
    expect((await bad({ reason: "backcharge", closedOn: "2026-02-21" })).status).toBe(409);
  });

  it("viewers cannot close or reopen; another org cannot touch it", async () => {
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const json = { reason: "backcharge", closedOn: "2026-02-21" };
    expect(
      (await api(`${t.appPath}/close-short`, { method: "POST", as: viewer.id, json })).status,
    ).toBe(403);
    const other = await setupTenant("owner");
    expect(
      (await api(`${t.appPath}/close-short`, { method: "POST", as: other.userId, json })).status,
    ).toBe(404);
    const crossPath = t.appPath.replace(t.orgId, other.orgId);
    expect(
      (await api(`${crossPath}/close-short`, { method: "POST", as: other.userId, json })).status,
    ).toBe(404);
    const still = await call<PayAppDetailDto>(t.appPath, { as: t.as });
    expect(still).toMatchObject({ status: "submitted", shortClose: null });
    await call(`${t.appPath}/close-short`, { method: "POST", as: t.as, json });
    expect(
      (await api(`${t.appPath}/close-short`, { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);
    expect(
      (await api(`${crossPath}/close-short`, { method: "DELETE", as: other.userId })).status,
    ).toBe(404);
  });
});
