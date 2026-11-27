// The lien deadline (src/shared/lien-deadline.ts) through the HTTP API on a real local D1: saved on the
// job, shown on the job, estimated from billing until a last-furnished date is entered, and named on
// the cash report (and its CSV) once money is owed and the date is near.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { addDays } from "@shared/lien-deadline";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, grantPlan, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function finishedJob(orgId: string, as: string, periodFrom: string, periodTo: string) {
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Bayside Clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Electrical", originalCents: 5_000_000 }] },
  });
  const lineId = project.sovLines[0]?.id ?? "";
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom, periodTo, applicationDate: periodTo },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: lineId,
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  return { base, id: created.id };
}

describe("lien deadline", () => {
  it("is estimated from billing, then dated from the entered last day, and reaches the cash report", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    // One application billing all the work, its period starting 80 days ago: Florida's 90 days from
    // that floor end within the 45-day window.
    const from = addDays(today(), -80);
    const job = await finishedJob(orgId, as, from, addDays(from, 20));

    let p = await call<ProjectDetailDto>(job.base, { as });
    expect(p.lienDeadline).toEqual({ kind: "no-state" });

    p = await call<ProjectDetailDto>(job.base, {
      method: "PATCH",
      as,
      json: { lienState: "fl" },
    });
    expect(p.lienState).toBe("FL");
    expect(p.lienDeadline.kind).toBe("deadline");
    if (p.lienDeadline.kind !== "deadline") throw new Error("no deadline");
    expect(p.lienDeadline.deadline.basis).toBe("estimated");
    expect(p.lienDeadline.deadline.fromOn).toBe(from);
    expect(p.lienDeadline.deadline.statutoryOn).toBe(addDays(from, 90));

    // Work is complete and the whole application is owed: the cash report names the estimate.
    let r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    let row = r.projects.find((x) => x.id === job.id);
    expect(row?.lienDeadline?.dueOn).toBe(p.lienDeadline.deadline.dueOn);
    let text = row?.actions.find((a) => a.startsWith("Florida lien deadline")) ?? "";
    expect(text).toContain("record a claim of lien by");
    expect(text).toContain("Fla. Stat. § 713.08(5)");
    expect(text).toContain("enter your last day on the job");

    // The real last day: later than the floor, so the date moves later and is no longer an estimate.
    const last = addDays(from, 15);
    p = await call<ProjectDetailDto>(job.base, {
      method: "PATCH",
      as,
      json: { lastFurnishedOn: last },
    });
    if (p.lienDeadline.kind !== "deadline") throw new Error("no deadline");
    expect(p.lienDeadline.deadline.basis).toBe("entered");
    expect(p.lienDeadline.deadline.statutoryOn).toBe(addDays(last, 90));
    r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
    row = r.projects.find((x) => x.id === job.id);
    text = row?.actions.find((a) => a.startsWith("Florida lien deadline")) ?? "";
    expect(text).toContain(p.lienDeadline.deadline.dueOn);
    expect(text).not.toContain("enter your last day on the job");

    // The CSV carries it, and its total row lines up with its header.
    const csv = await (await api(`/api/orgs/${orgId}/reports/cash.csv`, { as })).text();
    const rows = csv.split("\r\n");
    expect(rows[0]).toMatch(/,Lien deadline$/);
    expect(rows[1]).toContain(`${p.lienDeadline.deadline.dueOn} (Florida, Fla. Stat. § 713.08(5))`);
    const header = rows[0]?.split(",") ?? [];
    const total = rows.find((l) => l.startsWith("Total,"))?.split(",") ?? [];
    expect(total[header.indexOf("Past due")]).toMatch(/^\d/);
    expect(total[header.indexOf("Pay terms count from")]).toBe("");

    // The change is in the job history.
    const history = await (await api(`${job.base}/history.csv`, { as })).text();
    expect(history).toContain("last day furnished (lien deadline)");
  });

  it("refuses a state that is not two letters, says when a state is not carried, and clears", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    const job = await finishedJob(orgId, as, "2026-01-01", "2026-01-31");
    await call(job.base, { method: "PATCH", as, expect: 400, json: { lienState: "Florida" } });
    let p = await call<ProjectDetailDto>(job.base, {
      method: "PATCH",
      as,
      json: { lienState: "IL" },
    });
    expect(p.lienDeadline).toEqual({ kind: "unsupported", state: "IL" });
    p = await call<ProjectDetailDto>(job.base, {
      method: "PATCH",
      as,
      json: { lienState: null },
    });
    expect(p.lienDeadline).toEqual({ kind: "no-state" });
  });

  it("California: a recorded notice of completion shortens the date; viewers read but cannot change it", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    await grantPlan(orgId);
    const job = await finishedJob(orgId, as, "2026-08-01", "2026-08-31");
    const p = await call<ProjectDetailDto>(job.base, {
      method: "PATCH",
      as,
      json: {
        lienState: "CA",
        lastFurnishedOn: "2026-09-01",
        noticeOfCompletionOn: "2026-09-10",
      },
    });
    if (p.lienDeadline.kind !== "deadline") throw new Error("no deadline");
    expect(p.lienDeadline.deadline.statutoryOn).toBe("2026-10-10");
    expect(p.lienDeadline.deadline.dueOn).toBe("2026-10-09");

    const viewer = (await setupTenant("owner")).userId;
    await addToOrg(orgId, viewer, "viewer");
    const seen = await call<ProjectDetailDto>(job.base, { as: viewer });
    expect(seen.lienState).toBe("CA");
    await call(job.base, { method: "PATCH", as: viewer, expect: 403, json: { lienState: "AZ" } });
  });
});
