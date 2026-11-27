// Payments against a pay application: partial payments, auto-paid, reopening, certification and the
// cash report, through the HTTP API on a real local D1, plus roles and tenancy.
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

describe("payments", () => {
  let t: Awaited<ReturnType<typeof submittedApp>>;
  beforeEach(async () => {
    t = await submittedApp();
  });

  it("records partial payments, then marks the application paid when they reach line 8", async () => {
    const first = await call<PayAppDetailDto>(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 3_000_000, receivedOn: "2026-02-20", reference: " Check 1042 " },
    });
    expect(first.status).toBe("submitted");
    expect(first).toMatchObject({
      expectedCents: 4_500_000,
      paidCents: 3_000_000,
      remainingCents: 1_500_000,
    });
    expect(first.payments).toEqual([
      expect.objectContaining({
        amountCents: 3_000_000,
        receivedOn: "2026-02-20",
        reference: "Check 1042",
      }),
    ]);

    const report = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(report.totals).toMatchObject({ paidCents: 3_000_000, outstandingCents: 1_500_000 });
    expect(report.projects[0]?.outstanding[0]).toMatchObject({
      amountCents: 1_500_000,
      receivedCents: 3_000_000,
      lastReceivedOn: "2026-02-20",
    });

    const over = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 1_500_001, receivedOn: "2026-02-27" },
    });
    expect(over.status).toBe(409);
    expect(await over.text()).toContain("$15,000.00 still owed");

    const second = await call<PayAppDetailDto>(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_500_000, receivedOn: "2026-02-27" },
    });
    expect(second.status).toBe("paid");
    expect(second.paidAt).not.toBeNull();
    expect(second.remainingCents).toBe(0);
    const more = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 1, receivedOn: "2026-02-27" },
    });
    expect(more.status).toBe(409);
  });

  it("deleting a payment from a paid application reopens it", async () => {
    await call(`${t.appPath}/certify`, {
      method: "POST",
      as: t.as,
      json: { certifiedAmountCents: 4_000_000 },
    });
    const paid = await call<PayAppDetailDto>(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_000_000, receivedOn: "2026-02-20" },
    });
    expect(paid.status).toBe("paid");
    const id = paid.payments[0]?.id ?? "";
    const reopened = await call<PayAppDetailDto>(`${t.appPath}/payments/${id}`, {
      method: "DELETE",
      as: t.as,
    });
    expect(reopened).toMatchObject({
      status: "certified",
      paidAt: null,
      remainingCents: 4_000_000,
    });
    expect(reopened.payments).toEqual([]);
    expect((await api(`${t.appPath}/payments/${id}`, { method: "DELETE", as: t.as })).status).toBe(
      404,
    );
  });

  it("certification counts payments already received and cannot go below them", async () => {
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_000_000, receivedOn: "2026-02-20" },
    });
    const low = await api(`${t.appPath}/certify`, {
      method: "POST",
      as: t.as,
      json: { certifiedAmountCents: 3_999_999 },
    });
    expect(low.status).toBe(409);
    const certified = await call<PayAppDetailDto>(`${t.appPath}/certify`, {
      method: "POST",
      as: t.as,
      json: { certifiedAmountCents: 4_000_000 },
    });
    expect(certified.status).toBe("paid");
  });

  it("refuses drafts, future dates and zero amounts", async () => {
    const future = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 100, receivedOn: "2999-01-01" },
    });
    expect(future.status).toBe(409);
    const zero = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 0, receivedOn: "2026-02-01" },
    });
    expect(zero.status).toBe(400);
    const draft = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-02-01", periodTo: "2026-02-28", applicationDate: "2026-02-28" },
    });
    const onDraft = await api(`${t.base}/pay-apps/${draft.id}/payments`, {
      method: "POST",
      as: t.as,
      json: { amountCents: 100, receivedOn: "2026-02-01" },
    });
    expect(onDraft.status).toBe(409);
  });

  it("viewers cannot record payments; another org cannot see or delete them", async () => {
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const asViewer = await api(`${t.appPath}/payments`, {
      method: "POST",
      as: viewer.id,
      json: { amountCents: 100, receivedOn: "2026-02-01" },
    });
    expect(asViewer.status).toBe(403);

    const recorded = await call<PayAppDetailDto>(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 100, receivedOn: "2026-02-01" },
    });
    const id = recorded.payments[0]?.id ?? "";
    const other = await setupTenant("owner");
    expect(
      (
        await api(`${t.appPath}/payments`, {
          method: "POST",
          as: other.userId,
          json: { amountCents: 100, receivedOn: "2026-02-01" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(`${t.appPath}/payments/${id}`, { method: "DELETE", as: other.userId })).status,
    ).toBe(404);
    // The other org's own URL with this org's ids finds nothing either.
    const crossPath = t.appPath.replace(t.orgId, other.orgId);
    expect(
      (await api(`${crossPath}/payments/${id}`, { method: "DELETE", as: other.userId })).status,
    ).toBe(404);
    const still = await call<PayAppDetailDto>(t.appPath, { as: t.as });
    expect(still.payments).toHaveLength(1);
  });
});
