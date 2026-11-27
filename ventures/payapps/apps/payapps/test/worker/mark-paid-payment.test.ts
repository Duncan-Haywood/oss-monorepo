// Mark paid in full with the date and check: the balance becomes one recorded payment (so it can go
// to QuickBooks and dates the history); and a paid application with no payment behind it can record
// that money later. Through the HTTP API on a real local D1, plus roles and tenancy.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, call, createTestUser, setupTenant } from "./helpers";

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

interface History {
  items: { action: string; text: string }[];
}

describe("mark paid records the payment", () => {
  let t: Awaited<ReturnType<typeof submittedApp>>;
  beforeEach(async () => {
    t = await submittedApp();
  });

  it("records the balance as one payment with the date and check, and the application paid", async () => {
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_000_000, receivedOn: "2026-02-10" },
    });
    const d = await call<PayAppDetailDto>(`${t.appPath}/mark-paid`, {
      method: "POST",
      as: t.as,
      json: { receivedOn: "2026-02-25", reference: " 2231 " },
    });
    expect(d.status).toBe("paid");
    expect(d.unrecordedCents).toBe(0);
    expect(d.payments.map((p) => [p.amountCents, p.receivedOn, p.reference])).toEqual([
      [1_000_000, "2026-02-10", null],
      [3_500_000, "2026-02-25", "2231"],
    ]);
    const h = await call<History>(`${t.base}/pay-apps/history`, { as: t.as });
    expect(h.items.map((e) => e.text)).toContain(
      "Payment of $35,000.00 received 2026-02-25 (2231) recorded; now paid in full",
    );
    expect(h.items.some((e) => e.action === "marked_paid")).toBe(false);
  });

  it("refuses a future date or a check number with no date, and changes nothing", async () => {
    await call(`${t.appPath}/mark-paid`, {
      method: "POST",
      as: t.as,
      json: { receivedOn: "2999-01-01" },
      expect: 409,
    });
    await call(`${t.appPath}/mark-paid`, {
      method: "POST",
      as: t.as,
      json: { reference: "2231" },
      expect: 400,
    });
    const d = await call<PayAppDetailDto>(t.appPath, { as: t.as });
    expect(d.status).toBe("submitted");
    expect(d.payments).toEqual([]);
  });

  it("without a date only marks it paid, then records the money as a payment later", async () => {
    const marked = await call<PayAppDetailDto>(`${t.appPath}/mark-paid`, {
      method: "POST",
      as: t.as,
    });
    expect(marked.status).toBe("paid");
    expect(marked.payments).toEqual([]);
    expect(marked.unrecordedCents).toBe(4_500_000);
    expect(marked.paidCents).toBe(4_500_000);

    const after = await call<PayAppDetailDto>(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { receivedOn: "2026-03-01", reference: "ACH 99" },
    });
    expect(after.status).toBe("paid");
    expect(after.unrecordedCents).toBe(0);
    expect(after.paidCents).toBe(4_500_000);
    expect(after.payments).toEqual([
      expect.objectContaining({
        amountCents: 4_500_000,
        receivedOn: "2026-03-01",
        reference: "ACH 99",
      }),
    ]);
    const h = await call<History>(`${t.base}/pay-apps/history`, { as: t.as });
    const texts = h.items.map((e) => e.text);
    expect(texts).toContain("Payment of $45,000.00 received 2026-03-01 (ACH 99) recorded");

    // Nothing left to record.
    await call(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: t.as,
      expect: 409,
      json: { receivedOn: "2026-03-01" },
    });
  });

  it("records only the part with no payment behind it", async () => {
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 500_000, receivedOn: "2026-02-10" },
    });
    const marked = await call<PayAppDetailDto>(`${t.appPath}/mark-paid`, {
      method: "POST",
      as: t.as,
    });
    expect(marked.unrecordedCents).toBe(4_000_000);
    const after = await call<PayAppDetailDto>(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { receivedOn: "2026-03-01" },
    });
    expect(after.payments.map((p) => p.amountCents)).toEqual([500_000, 4_000_000]);
  });

  it("never offers the balance closed short as money received", async () => {
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_000_000, receivedOn: "2026-02-10" },
    });
    const closed = await call<PayAppDetailDto>(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "backcharge", closedOn: "2026-02-15" },
    });
    expect(closed.status).toBe("paid");
    expect(closed.unrecordedCents).toBe(0);
    await call(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: t.as,
      expect: 409,
      json: { receivedOn: "2026-03-01" },
    });
  });

  it("refuses an unpaid application, a viewer and another company", async () => {
    await call(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: t.as,
      expect: 409,
      json: { receivedOn: "2026-03-01" },
    });
    await call(`${t.appPath}/mark-paid`, { method: "POST", as: t.as });
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: viewer.id,
      expect: 403,
      json: { receivedOn: "2026-03-01" },
    });
    const other = await setupTenant("owner");
    await call(`${t.appPath}/payments/unrecorded`, {
      method: "POST",
      as: other.userId,
      expect: 404,
      json: { receivedOn: "2026-03-01" },
    });
    const d = await call<PayAppDetailDto>(t.appPath, { as: t.as });
    expect(d.payments).toEqual([]);
  });
});
