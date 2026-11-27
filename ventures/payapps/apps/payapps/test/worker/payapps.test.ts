// End-to-end pay-application flow through the HTTP API (real local D1).
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let project: ProjectDetailDto;

const line = (sovLineId: string, work: number, stored = 0, released = 0) => ({
  sovLineId,
  workThisPeriodCents: work,
  storedMaterialsCents: stored,
  retainageReleasedCents: released,
});

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  // This suite bills several jobs in one org; plan limits are covered in billing.test.ts.
  await grantPlan(orgId);
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Clinic TI",
      number: "P-101",
      gcName: "Example Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${created.id}`;
  project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Rough-in", originalCents: 6_000_000 },
        { itemNumber: "2", description: "Fixtures", originalCents: 4_000_000 },
      ],
    },
  });
});

describe("pay application flow", () => {
  let app1: PayAppDetailDto;
  let app2: PayAppDetailDto;
  const lineId = (n: number) => project.sovLines[n]?.id ?? "";

  it("creates the project with a schedule of values that reconciles to the contract", () => {
    expect(project.sovTotalCents).toBe(10_000_000);
    expect(project.sovLines.map((l) => l.itemNumber)).toEqual(["1", "2"]);
    expect(project.billingStarted).toBe(false);
  });

  it("bills period 1 with stored materials and submits it", async () => {
    app1 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    expect(app1.number).toBe(1);
    expect(app1.editable).toBe(true);
    app1 = await call<PayAppDetailDto>(`${base}/pay-apps/${app1.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [line(lineId(0), 2_000_000), line(lineId(1), 0, 500_000)] },
    });
    expect(app1.computed.summary).toMatchObject({
      totalCompletedAndStoredCents: 2_500_000,
      totalRetainageCents: 250_000,
      currentPaymentDueCents: 2_250_000,
    });
    expect(app1.blockers).toEqual([]);
    const submitted = await call<PayAppDetailDto>(`${base}/pay-apps/${app1.id}/submit`, {
      method: "POST",
      as,
    });
    expect(submitted.status).toBe("submitted");
    expect(submitted.editable).toBe(false);
  });

  it("locks submitted history", async () => {
    const res = await api(`${base}/pay-apps/${app1.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [] },
    });
    expect(res.status).toBe(409);
    const sov = await api(`${base}/sov-lines/${lineId(0)}`, {
      method: "PATCH",
      as,
      json: { originalCents: 1 },
    });
    expect(sov.status).toBe(409);
    const contract = await api(base, {
      method: "PATCH",
      as,
      json: { originalContractSumCents: 1 },
    });
    expect(contract.status).toBe(409);
    // Descriptions may still be corrected.
    await call(`${base}/sov-lines/${lineId(0)}`, {
      method: "PATCH",
      as,
      json: { description: "Rough-in (all levels)" },
    });
  });

  it("applies an approved change order that adds a line", async () => {
    project = await call<ProjectDetailDto>(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-1",
        description: "Added fixtures and a new gas line",
        items: [
          { sovLineId: lineId(1), amountCents: 500_000 },
          { newLine: { itemNumber: "3", description: "Gas line" }, amountCents: 200_000 },
        ],
      },
    });
    const co = project.changeOrders[0];
    expect(co?.totalCents).toBe(700_000);
    // Cannot be dated into the submitted period.
    const early = await api(`${base}/change-orders/${co?.id}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-01-15" },
    });
    expect(early.status).toBe(400);
    project = await call<ProjectDetailDto>(`${base}/change-orders/${co?.id}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-02-10" },
    });
    expect(project.sovLines.map((l) => l.currentCents)).toEqual([6_000_000, 4_500_000, 200_000]);
  });

  it("bills period 2 against the previous application", async () => {
    const overlapping = await api(`${base}/pay-apps`, {
      method: "POST",
      as,
      json: { periodFrom: "2026-01-15", periodTo: "2026-02-28", applicationDate: "2026-02-28" },
    });
    expect(overlapping.status).toBe(400);
    app2 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-02-01", periodTo: "2026-02-28", applicationDate: "2026-02-28" },
    });
    expect(app2.number).toBe(2);
    app2 = await call<PayAppDetailDto>(`${base}/pay-apps/${app2.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          line(lineId(0), 1_000_000),
          line(lineId(1), 1_500_000),
          line(project.sovLines[2]?.id ?? "", 200_000),
        ],
      },
    });
    expect(app2.computed.summary).toMatchObject({
      netChangeByChangeOrdersCents: 700_000,
      contractSumToDateCents: 10_700_000,
      totalCompletedAndStoredCents: 4_700_000,
      totalRetainageCents: 470_000,
      lessPreviousCertificatesCents: 2_250_000,
      currentPaymentDueCents: 1_980_000,
      balanceToFinishIncludingRetainageCents: 6_470_000,
    });
    // Only one draft at a time.
    const another = await api(`${base}/pay-apps`, {
      method: "POST",
      as,
      json: { periodFrom: "2026-03-01", periodTo: "2026-03-31", applicationDate: "2026-03-31" },
    });
    expect(another.status).toBe(409);
  });

  it("refuses to submit with blocking problems", async () => {
    await call(`${base}/pay-apps/${app2.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [line(lineId(0), 1_000_000, 0, 999_999_999)] },
    });
    const res = await api(`${base}/pay-apps/${app2.id}/submit`, { method: "POST", as });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: { code: string }[] } };
    expect(body.error.code).toBe("pay_app_has_errors");
    expect(body.error.details.map((d) => d.code)).toContain("retainage_release_exceeds_held");
  });

  it("rejects entries for lines of another project", async () => {
    const other = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: { name: "Other", gcName: "GC", originalContractSumCents: 100 },
    });
    const otherDetail = await call<ProjectDetailDto>(
      `/api/orgs/${orgId}/projects/${other.id}/sov-lines`,
      {
        method: "POST",
        as,
        expect: 201,
        json: { itemNumber: "1", description: "x", originalCents: 100 },
      },
    );
    const res = await api(`${base}/pay-apps/${app2.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [line(otherDetail.sovLines[0]?.id ?? "", 1)] },
    });
    expect(res.status).toBe(400);
  });

  it("exports PDF and CSV", async () => {
    const pdf = await api(`${base}/pay-apps/${app1.id}/application.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toBe(
      'attachment; filename="p-101-payapp-1.pdf"',
    );
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("%PDF-1.4");

    const csv = await api(`${base}/pay-apps/${app1.id}/continuation.csv`, { as });
    expect(csv.headers.get("Content-Type")).toContain("text/csv");
    const rows = (await csv.text()).trim().split("\r\n");
    expect(rows).toHaveLength(4); // header, 2 lines, totals
    expect(rows[3]).toContain("TOTALS");

    const summary = await (await api(`${base}/pay-apps/${app1.id}/summary.csv`, { as })).text();
    expect(summary).toContain("8. Current payment due,22500");
  });

  it("certifies and marks paid", async () => {
    const certified = await call<PayAppDetailDto>(`${base}/pay-apps/${app1.id}/certify`, {
      method: "POST",
      as,
      json: {},
    });
    expect(certified.status).toBe("certified");
    expect(certified.certifiedAmountCents).toBe(2_250_000);
    const paid = await call<PayAppDetailDto>(`${base}/pay-apps/${app1.id}/mark-paid`, {
      method: "POST",
      as,
    });
    expect(paid.status).toBe("paid");
  });

  it("deletes a draft but not submitted applications", async () => {
    expect((await api(`${base}/pay-apps/${app1.id}`, { method: "DELETE", as })).status).toBe(409);
    expect((await api(`${base}/pay-apps/${app2.id}`, { method: "DELETE", as })).status).toBe(200);
    const list = await call<{ items: unknown[] }>(`${base}/pay-apps`, { as });
    expect(list.items).toHaveLength(1);
  });
});

describe("roles", () => {
  it("viewers can read but not write", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await api(base, { as: viewer.id })).status).toBe(200);
    const res = await api(`${base}/sov-lines`, {
      method: "POST",
      as: viewer.id,
      json: { itemNumber: "9", description: "x", originalCents: 0 },
    });
    expect(res.status).toBe(403);
  });

  it("requires sign-in", async () => {
    expect((await api(base)).status).toBe(401);
    expect((await api("/api/me")).status).toBe(401);
  });

  it("validates input", async () => {
    const res = await api(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      json: { name: "", gcName: "GC", originalContractSumCents: 1.5 },
    });
    expect(res.status).toBe(400);
  });
});
