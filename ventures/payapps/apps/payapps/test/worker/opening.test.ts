// Mid-job start: a job already billed elsewhere moves here with its last application as the
// opening balance; the first application here continues the numbering and the money.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant } from "./helpers";

let as: string;
let base: string;
let project: ProjectDetailDto;
const lineId = (n: number) => project.sovLines[n]?.id ?? "";

// Application #3, made in a spreadsheet: rough-in $40,000 of $60,000 done, fixtures $5,000 of
// $40,000, 10% retainage, so line 4 = $45,000, line 5a = $4,500 and line 6 = $40,500.
const opening = () => ({
  appNumber: 3,
  periodTo: "2026-03-31",
  previousCertificatesCents: 4_050_000,
  retainageHeldCents: 450_000,
  lines: [
    { sovLineId: lineId(0), completedCents: 4_000_000 },
    { sovLineId: lineId(1), completedCents: 500_000 },
  ],
});

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  await grantPlan(t.orgId);
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Dental TI",
      gcName: "Example Builders",
      contractDate: "2026-01-05",
      originalContractSumCents: 10_000_000,
    },
  });
  base = `/api/orgs/${t.orgId}/projects/${created.id}`;
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

describe("mid-job start", () => {
  let app4: PayAppDetailDto;

  it("records the last application made elsewhere", async () => {
    project = await call<ProjectDetailDto>(`${base}/opening`, {
      method: "PUT",
      as,
      json: opening(),
    });
    expect(project.opening).toEqual({
      appNumber: 3,
      periodTo: "2026-03-31",
      previousCertificatesCents: 4_050_000,
      retainageHeldCents: 450_000,
    });
    expect(project.sovLines.map((l) => l.openingCompletedCents)).toEqual([4_000_000, 500_000]);
  });

  it("rejects an opening line from another job and one ending before the contract", async () => {
    const bad = await api(`${base}/opening`, {
      method: "PUT",
      as,
      json: { ...opening(), lines: [{ sovLineId: "sov_nope", completedCents: 1 }] },
    });
    expect(bad.status).toBe(400);
    const early = await api(`${base}/opening`, {
      method: "PUT",
      as,
      json: { ...opening(), periodTo: "2025-12-31" },
    });
    expect(early.status).toBe(400);
  });

  it("refuses a first period that overlaps the opening application", async () => {
    const res = await api(`${base}/pay-apps`, {
      method: "POST",
      as,
      json: { periodFrom: "2026-03-15", periodTo: "2026-04-30", applicationDate: "2026-04-30" },
    });
    expect(res.status).toBe(400);
  });

  it("carries retainage released on a line before the move, and refuses it on a line with no work", async () => {
    // $1,000 of rough-in's $4,000 retainage was released by #3: line 5a $3,500, line 6 $41,500.
    const released = {
      ...opening(),
      previousCertificatesCents: 4_150_000,
      retainageHeldCents: 350_000,
      lines: [
        { sovLineId: lineId(0), completedCents: 4_000_000, releasedCents: 100_000 },
        { sovLineId: lineId(1), completedCents: 500_000 },
      ],
    };
    project = await call<ProjectDetailDto>(`${base}/opening`, {
      method: "PUT",
      as,
      json: released,
    });
    expect(project.sovLines.map((l) => l.openingReleasedCents)).toEqual([100_000, 0]);
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-04-01", periodTo: "2026-04-30", applicationDate: "2026-04-30" },
    });
    expect(app.computed.lines.map((l) => l.retainageCents)).toEqual([300_000, 50_000]);
    expect(app.computed.summary).toMatchObject({
      totalRetainageCents: 350_000,
      lessPreviousCertificatesCents: 4_150_000,
      currentPaymentDueCents: 0,
    });
    expect(app.computed.warnings).toEqual([]);
    await call(`${base}/pay-apps/${app.id}`, { method: "DELETE", as });

    const noWork = await api(`${base}/opening`, {
      method: "PUT",
      as,
      json: {
        ...opening(),
        lines: [{ sovLineId: lineId(1), completedCents: 0, releasedCents: 1_000 }],
      },
    });
    expect(noWork.status).toBe(400);
    project = await call<ProjectDetailDto>(`${base}/opening`, {
      method: "PUT",
      as,
      json: opening(),
    });
    expect(project.sovLines.map((l) => l.openingReleasedCents)).toEqual([0, 0]);
  });

  it("numbers the first application here #4 and carries work and certificates", async () => {
    app4 = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-04-01", periodTo: "2026-04-30", applicationDate: "2026-04-30" },
    });
    expect(app4.number).toBe(4);
    app4 = await call<PayAppDetailDto>(`${base}/pay-apps/${app4.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId: lineId(0),
            workThisPeriodCents: 1_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    const [rough, fixtures] = app4.computed.lines;
    expect(rough?.fromPreviousCents).toBe(4_000_000);
    expect(fixtures?.fromPreviousCents).toBe(500_000);
    // Line 4 $55,000, 5 $5,500, 6 $49,500, 7 $40,500 (line 6 of #3), 8 $9,000.
    expect(app4.computed.summary).toMatchObject({
      totalCompletedAndStoredCents: 5_500_000,
      totalRetainageCents: 550_000,
      totalEarnedLessRetainageCents: 4_950_000,
      lessPreviousCertificatesCents: 4_050_000,
      currentPaymentDueCents: 900_000,
    });
    expect(app4.computed.warnings).toEqual([]);
  });

  it("locks the opening balance once an application here exists", async () => {
    const res = await api(`${base}/opening`, { method: "DELETE", as });
    expect(res.status).toBe(409);
  });

  it("warns when the retainage held elsewhere does not match, without blocking", async () => {
    await call(`${base}/pay-apps/${app4.id}`, { method: "DELETE", as });
    project = await call<ProjectDetailDto>(`${base}/opening`, {
      method: "PUT",
      as,
      json: { ...opening(), retainageHeldCents: 400_000 },
    });
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-04-01", periodTo: "2026-04-30", applicationDate: "2026-04-30" },
    });
    expect(app.computed.warnings.map((w) => w.code)).toEqual(["opening_retainage_differs"]);
    expect(app.blockers).toEqual([]);
    await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  });

  it("a job billed from #1 has no opening and starts at #1", async () => {
    const other = await call<ProjectDto>(base.replace(/\/[^/]+$/, ""), {
      method: "POST",
      as,
      expect: 201,
      json: { name: "New job", gcName: "GC", originalContractSumCents: 0 },
    });
    expect(other.opening).toBeNull();
  });
});
