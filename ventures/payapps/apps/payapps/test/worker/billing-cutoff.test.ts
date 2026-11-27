// The GC's billing cutoff day on a job: unset on a new job, set on the new-job form or the job page,
// validated, editor-only, recorded in the job history, and read by the cash report's next steps
// (src/shared/billing-cutoff.ts). The worker's clock is the real one, so the cutoff day used here is
// today's day of the month (UTC): the cutoff is then today.

import type { JobEventDto, PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
const todayDay = () => Number(today().slice(8, 10));

async function job(extra: Record<string, unknown> = {}) {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "County Library",
      gcName: "Harbor Builders",
      originalContractSumCents: 1_000_000,
      ...extra,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 1_000_000 }] },
  });
  const draft = (applicationDate: string, periodTo = applicationDate) =>
    call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: `${periodTo.slice(0, 8)}01`, periodTo, applicationDate },
    });
  const nextSteps = async () => {
    const r = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as });
    return r.projects.find((p) => p.id === created.id)?.actions ?? [];
  };
  return { ...t, as, created, base, draft, nextSteps };
}

describe("billing cutoff", () => {
  it("is unset on a new job, set and cleared on the job page, and kept in the job history", async () => {
    const { created, base, as } = await job();
    expect(created.billingDay).toBeNull();
    const set = await call<ProjectDto>(base, { method: "PATCH", as, json: { billingDay: 25 } });
    expect(set.billingDay).toBe(25);
    expect(set.retainagePctBps).toBe(1000); // a PATCH changes only what it sends
    const cleared = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { billingDay: null },
    });
    expect(cleared.billingDay).toBeNull();
    const history = await call<{ items: JobEventDto[] }>(`${base}/history`, { as });
    expect(history.items.filter((e) => e.text.includes("GC billing cutoff day"))).toHaveLength(2);
  });

  it("can be set on the new-job form", async () => {
    const { created } = await job({ billingDay: 31 });
    expect(created.billingDay).toBe(31);
  });

  it("refuses a day outside 1-31 and a viewer's change", async () => {
    const { base, orgId, as } = await job();
    for (const billingDay of [0, 32, 2.5, "25"]) {
      const res = await api(base, { as, method: "PATCH", json: { billingDay } });
      expect(res.status).toBe(400);
    }
    const viewer = await setupTenant("owner");
    await addToOrg(orgId, viewer.userId, "viewer");
    const res = await api(base, { as: viewer.userId, method: "PATCH", json: { billingDay: 25 } });
    expect(res.status).toBe(403);
    expect((await call<ProjectDto>(base, { as })).billingDay).toBeNull();
  });

  it("puts a draft due today in the cash report's next steps, and drops it once submitted", async () => {
    const { base, as, draft, nextSteps } = await job();
    const app = await draft(today());
    expect((await nextSteps()).some((s) => s.includes("Pay application due"))).toBe(false);
    await call(base, { method: "PATCH", as, json: { billingDay: todayDay() } });
    const due = (await nextSteps()).find((s) => s.startsWith("Pay application due"));
    expect(due).toBe(
      `Pay application due to Harbor Builders today, ${today()} (cutoff the ${todayDay()}${
        [11, 12, 13].includes(todayDay())
          ? "th"
          : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[todayDay() % 10] ?? "th")
      } of the month): draft #${app.number} is not submitted yet.`,
    );
    await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
    expect((await nextSteps()).some((s) => s.includes("Pay application due"))).toBe(false);
  });

  it("says when a draft dated before the last cutoff missed it", async () => {
    const { base, as, draft, nextSteps } = await job();
    const app = await draft("2025-01-31");
    await call(base, { method: "PATCH", as, json: { billingDay: todayDay() } });
    const missed = (await nextSteps()).find((s) => s.includes("was not submitted by"));
    expect(missed).toContain(`Application #${app.number} (dated 2025-01-31)`);
    expect(missed).toContain("(Harbor Builders takes applications by the");
  });

  it("keeps quiet on a closed job", async () => {
    const { base, as, draft, nextSteps } = await job();
    await draft(today());
    await call(base, { method: "PATCH", as, json: { billingDay: todayDay(), status: "closed" } });
    expect((await nextSteps()).some((s) => s.includes("Pay application due"))).toBe(false);
  });

  it("is not readable or writable from another company", async () => {
    const { base } = await job();
    const other = await setupTenant("owner");
    const res = await api(base, { as: other.userId, method: "PATCH", json: { billingDay: 25 } });
    expect([403, 404]).toContain(res.status);
  });
});
