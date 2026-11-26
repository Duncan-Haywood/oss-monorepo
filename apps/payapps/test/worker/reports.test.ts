// Cash report across jobs: through the HTTP API on a real local D1, plus tenancy and the CSV.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, grantPlan, setupTenant } from "./helpers";

const line = (sovLineId: string, work: number) => ({
  sovLineId,
  workThisPeriodCents: work,
  storedMaterialsCents: 0,
  retainageReleasedCents: 0,
});

async function jobWithApps(orgId: string, as: string, name: string, sum: number) {
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      gcName: "Harbor Builders",
      originalContractSumCents: sum,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: sum }] },
  });
  const lineId = project.sovLines[0]?.id ?? "";
  const bill = async (from: string, to: string, work: number) => {
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    await call(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [line(lineId, work)] },
    });
    return app;
  };
  return { id: created.id, base, bill };
}

describe("cash report", () => {
  it("adds up applied, paid, outstanding and retainage across jobs, ignoring drafts", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    const a = await jobWithApps(orgId, as, "Clinic TI", 10_000_000);
    const a1 = await a.bill("2026-01-01", "2026-01-31", 4_000_000);
    await call(`${a.base}/pay-apps/${a1.id}/submit`, { method: "POST", as });
    await call(`${a.base}/pay-apps/${a1.id}/certify`, {
      method: "POST",
      as,
      json: { certifiedAmountCents: 3_500_000 },
    });
    const a2 = await a.bill("2026-02-01", "2026-02-28", 6_000_000);
    await call(`${a.base}/pay-apps/${a2.id}/submit`, { method: "POST", as });

    const b = await jobWithApps(orgId, as, "Warehouse", 5_000_000);
    const b1 = await b.bill("2026-01-01", "2026-01-31", 5_000_000);
    await call(`${b.base}/pay-apps/${b1.id}/submit`, { method: "POST", as });
    await call(`${b.base}/pay-apps/${b1.id}/mark-paid`, { method: "POST", as });
    await b.bill("2026-02-01", "2026-02-28", 0); // a draft: not counted

    const r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    const clinic = r.projects.find((p) => p.id === a.id);
    const warehouse = r.projects.find((p) => p.id === b.id);
    expect(clinic).toMatchObject({
      appliedCents: 3_600_000 + 5_400_000,
      paidCents: 0,
      outstandingCents: 3_500_000 + 5_400_000,
      retainageHeldCents: 1_000_000,
      workComplete: true,
    });
    expect(warehouse).toMatchObject({
      appliedCents: 4_500_000,
      paidCents: 4_500_000,
      outstandingCents: 0,
      retainageHeldCents: 500_000,
      workComplete: true,
    });
    expect(warehouse?.actions[0]).toMatch(/bill the retainage/);
    expect(r.totals.retainageOnCompleteJobsCents).toBe(1_500_000);
    expect(r.totals.outstandingCents).toBe(8_900_000);
    expect(r.projects[0]?.id).toBe(a.id); // most money owed first

    const csv = await api(`/api/orgs/${orgId}/reports/cash.csv`, { as });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    const text = await csv.text();
    expect(text.split("\r\n")[0]).toMatch(/^Job,Job number,General contractor/);
    expect(text).toContain("Clinic TI");
    expect(text).toMatch(/\r\nTotal,,,,150000,,,135000,45000,89000,,15000,/);
  });

  it("dates unpaid applications from the job's pay terms and totals what is past due", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    const a = await jobWithApps(orgId, as, "Clinic TI", 10_000_000);
    const a1 = await a.bill("2026-01-01", "2026-01-31", 4_000_000);
    await call(`${a.base}/pay-apps/${a1.id}/submit`, { method: "POST", as });

    // No terms: no due date, and the money is reported as owed on a job without terms.
    let r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    expect(r.projects[0]?.outstanding[0]).toMatchObject({ dueOn: null, daysPastDue: 0 });
    expect(r.totals.noTermsOutstandingCents).toBe(3_600_000);

    // Out of range is refused; 30 days is saved and shown on the job.
    await call(a.base, { method: "PATCH", as, expect: 400, json: { payTermsDays: 400 } });
    const saved = await call<ProjectDto>(a.base, {
      method: "PATCH",
      as,
      json: { payTermsDays: 30 },
    });
    expect(saved.payTermsDays).toBe(30);

    r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    const clinic = r.projects.find((p) => p.id === a.id);
    expect(clinic?.payTermsDays).toBe(30);
    expect(clinic?.outstanding[0]).toMatchObject({ dueOn: "2026-03-02" });
    expect(clinic?.outstanding[0]?.daysPastDue).toBeGreaterThan(0);
    expect(clinic?.pastDueCents).toBe(3_600_000);
    expect(r.totals.pastDueCents).toBe(3_600_000);
    expect(r.totals.noTermsOutstandingCents).toBe(0);
    expect(clinic?.actions.join(" ")).toMatch(/#1 was due on 2026-03-02 \(30 days\)/);

    const text = await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text();
    expect(text.split("\r\n")[0]).toMatch(/,Pay terms \(days\),Pay terms count from,Past due,/);

    // Clearing the terms goes back to the age-based follow-up.
    const cleared = await call<ProjectDto>(a.base, {
      method: "PATCH",
      as,
      json: { payTermsDays: null },
    });
    expect(cleared.payTermsDays).toBeNull();
  });

  it("counts pay terms from the period end when the job says so", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    const a = await jobWithApps(orgId, as, "Clinic TI", 10_000_000);
    // Application dated 02-06 for the period ending 01-31.
    const app = await call<PayAppDetailDto>(`${a.base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-02-06" },
    });
    const project = await call<ProjectDetailDto>(a.base, { as });
    expect(project.payTermsBasis).toBe("application_date"); // the default
    await call(`${a.base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: { lines: [line(project.sovLines[0]?.id ?? "", 4_000_000)] },
    });
    await call(`${a.base}/pay-apps/${app.id}/submit`, { method: "POST", as });

    await call(a.base, {
      method: "PATCH",
      as,
      expect: 400,
      json: { payTermsBasis: "invoice_date" },
    });
    let saved = await call<ProjectDto>(a.base, {
      method: "PATCH",
      as,
      json: { payTermsDays: 30, payTermsBasis: "period_end" },
    });
    expect(saved).toMatchObject({ payTermsDays: 30, payTermsBasis: "period_end" });
    let r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    expect(r.projects[0]?.outstanding[0]).toMatchObject({ dueOn: "2026-03-02" });
    expect(r.projects[0]?.actions.join(" ")).toMatch(
      /#1 was due on 2026-03-02 \(30 days after the period end\)/,
    );
    const csv = (await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text()).split(
      "\r\n",
    );
    expect(csv[1]).toMatch(/,30,period end,/);

    // Back to the application date: due 30 days after 02-06.
    saved = await call<ProjectDto>(a.base, {
      method: "PATCH",
      as,
      json: { payTermsBasis: "application_date" },
    });
    expect(saved.payTermsBasis).toBe("application_date");
    r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    expect(r.projects[0]?.outstanding[0]).toMatchObject({ dueOn: "2026-03-08" });

    // Set on the new-job form too.
    const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Warehouse",
        gcName: "Harbor Builders",
        originalContractSumCents: 1_000_000,
        payTermsDays: 45,
        payTermsBasis: "period_end",
      },
    });
    expect(created.payTermsBasis).toBe("period_end");
  });

  it("a viewer cannot change pay terms, and another org cannot see the job", async () => {
    const owner = await setupTenant("owner");
    const job = await jobWithApps(owner.orgId, owner.userId, "Clinic TI", 1_000_000);
    const viewer = await setupTenant("owner");
    await addToOrg(owner.orgId, viewer.userId, "viewer");
    const outsider = await setupTenant("owner");
    const patch = (as: string) =>
      api(job.base, { as, method: "PATCH", json: { payTermsDays: 30 } }).then((r) => r.status);
    expect(await patch(viewer.userId)).toBe(403);
    expect(await patch(outsider.userId)).toBe(404);
  });

  it("any member can read it; another org gets a 404", async () => {
    const { orgId } = await setupTenant("owner");
    const viewer = await setupTenant("viewer");
    const other = await setupTenant("owner");
    expect(
      (await api(`/api/orgs/${viewer.orgId}/reports/cash`, { as: viewer.userId })).status,
    ).toBe(200);
    expect((await api(`/api/orgs/${orgId}/reports/cash`, { as: other.userId })).status).toBe(404);
    expect((await api(`/api/orgs/${orgId}/reports/cash.csv`, { as: other.userId })).status).toBe(
      404,
    );
    const empty = await call<CashReport>(`/api/orgs/${other.orgId}/reports/cash`, {
      as: other.userId,
    });
    expect(empty.projects).toEqual([]);
    expect(empty.totals.outstandingCents).toBe(0);
  });

  it("reports change orders waiting for approval, aged from the date sent to the GC", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const a = await jobWithApps(orgId, as, "Clinic TI", 10_000_000);
    const detail = await call<ProjectDetailDto>(a.base, { as });
    const lineId = detail.sovLines[0]?.id ?? "";
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const co = (number: string, amountCents: number, submittedOn?: string | null) => ({
      number,
      description: `Change ${number}`,
      ...(submittedOn !== undefined ? { submittedOn } : {}),
      items: [{ sovLineId: lineId, amountCents }],
    });

    // A date sent in the future is refused.
    await call(`${a.base}/change-orders`, {
      method: "POST",
      as,
      expect: 400,
      json: co("1", 500_000, tomorrow),
    });
    let p = await call<ProjectDetailDto>(`${a.base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: co("1", 500_000, "2026-01-15"),
    });
    p = await call<ProjectDetailDto>(`${a.base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: co("2", -100_000),
    });
    const [one, two] = p.changeOrders;
    expect(one).toMatchObject({ number: "1", submittedOn: "2026-01-15" });
    expect(two?.submittedOn).toBeNull();
    expect(two?.createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    let r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    let job = r.projects.find((x) => x.id === a.id);
    expect(job?.pendingChanges.map((c) => [c.number, c.agedFrom])).toEqual([
      ["1", "sent"],
      ["2", "entered"],
    ]);
    expect(job?.pendingChangeCents).toBe(500_000);
    expect(r.totals.pendingChangeOrders).toBe(2);
    expect(job?.actions.join(" ")).toMatch(/^Change order 1 \(Change 1, \$5,000\.00\) has waited/);

    // Record the date sent later, or clear it; never in the future.
    const sent = `${a.base}/change-orders/${two?.id}/sent`;
    await call(sent, { method: "PUT", as, expect: 400, json: { submittedOn: tomorrow } });
    p = await call<ProjectDetailDto>(sent, {
      method: "PUT",
      as,
      json: { submittedOn: "2026-02-01" },
    });
    expect(p.changeOrders[1]?.submittedOn).toBe("2026-02-01");
    p = await call<ProjectDetailDto>(sent, { method: "PUT", as, json: { submittedOn: null } });
    expect(p.changeOrders[1]?.submittedOn).toBeNull();

    // Once approved it leaves the list, and its date sent is fixed.
    await call(`${a.base}/change-orders/${one?.id}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-02-10" },
    });
    await call(`${a.base}/change-orders/${one?.id}/sent`, {
      method: "PUT",
      as,
      expect: 409,
      json: { submittedOn: "2026-01-20" },
    });
    r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    job = r.projects.find((x) => x.id === a.id);
    expect(job?.pendingChanges.map((c) => c.number)).toEqual(["2"]);
    expect(job?.pendingChangeCents).toBe(0);

    const text = await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text();
    expect(text.split("\r\n")[0]).toMatch(
      /,Pending change orders \(additions\),Pending change orders,Backcharged,Disputed \(closed short\),Written off,Waiting on the owner's payment \(pay-when-paid\),Pay-when-paid outer limit \(days from the application date\)$/,
    );
  });

  it("only editors record the date sent, and only in their own org", async () => {
    const owner = await setupTenant("owner");
    const job = await jobWithApps(owner.orgId, owner.userId, "Clinic TI", 1_000_000);
    const detail = await call<ProjectDetailDto>(job.base, { as: owner.userId });
    const p = await call<ProjectDetailDto>(`${job.base}/change-orders`, {
      method: "POST",
      as: owner.userId,
      expect: 201,
      json: {
        number: "1",
        description: "Extra",
        items: [{ sovLineId: detail.sovLines[0]?.id ?? "", amountCents: 1000 }],
      },
    });
    const url = `${job.base}/change-orders/${p.changeOrders[0]?.id}/sent`;
    const viewer = await setupTenant("owner");
    await addToOrg(owner.orgId, viewer.userId, "viewer");
    const outsider = await setupTenant("owner");
    const put = (as: string) =>
      api(url, { as, method: "PUT", json: { submittedOn: "2026-01-02" } }).then((r) => r.status);
    expect(await put(viewer.userId)).toBe(403);
    expect(await put(outsider.userId)).toBe(404);
    expect(await put(owner.userId)).toBe(200);
  });
});
