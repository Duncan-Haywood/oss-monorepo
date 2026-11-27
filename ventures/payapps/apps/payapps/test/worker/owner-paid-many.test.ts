// Pay-when-paid, several applications at once (PUT .../pay-apps/owner-paid): one owner's payment date
// recorded on more than one sent application of a job, all or nothing, with one history row per
// application naming the others; the cash report counts each due date from it; roles and tenancy.
import type {
  PayAppDetailDto,
  PayAppEventDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

// A $100,000 pay-when-paid job (7 days after the owner pays), three applications of $10,000 work
// each for January, February and March; the first `sent` are submitted, the rest stay drafts.
async function threeApps(sent = 3) {
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
  const ids: string[] = [];
  const months = [
    ["2026-01-01", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-31"],
  ] as const;
  for (const [i, [from, to]] of months.entries()) {
    if (i > sent) break;
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    await call(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId: project.sovLines[0]?.id ?? "",
            workThisPeriodCents: 1_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    ids.push(app.id);
    if (i < sent) await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  }
  return { orgId, as, base, ids, path: `${base}/pay-apps/owner-paid` };
}

const history = (base: string, as: string, id: string) =>
  call<{ items: PayAppEventDto[] }>(`${base}/pay-apps/${id}/history`, { as }).then((h) => h.items);

describe("owner's payment on several applications at once", () => {
  it("records one date on each, dates them in the cash report and names the others in history", async () => {
    const t = await threeApps();
    const [a1, a2, a3] = t.ids as [string, string, string];
    const project = await call<ProjectDetailDto>(t.path, {
      method: "PUT",
      as: t.as,
      json: { payAppIds: [a2, a1], ownerPaidOn: "2026-03-05" },
    });
    expect(project.payApps.map((a) => a.ownerPaidOn)).toEqual(["2026-03-05", "2026-03-05", null]);

    const r = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    const due = Object.fromEntries(
      (r.projects[0]?.outstanding ?? []).map((o) => [o.number, o.dueOn]),
    );
    expect(due).toEqual({ 1: "2026-03-12", 2: "2026-03-12", 3: null });

    expect((await history(t.base, t.as, a1))[0]?.text).toBe(
      "Owner's payment to the GC for application #1 recorded as 2026-03-05, together with application #2",
    );
    expect((await history(t.base, t.as, a2))[0]?.text).toBe(
      "Owner's payment to the GC for application #2 recorded as 2026-03-05, together with application #1",
    );
    expect(await history(t.base, t.as, a3)).not.toContainEqual(
      expect.objectContaining({ action: "owner_payment_recorded" }),
    );

    // The same date again changes nothing and writes no row; a new one only on the apps it changes.
    const before = (await history(t.base, t.as, a1)).length;
    await call(t.path, {
      method: "PUT",
      as: t.as,
      json: { payAppIds: [a1, a3], ownerPaidOn: "2026-03-05" },
    });
    expect(await history(t.base, t.as, a1)).toHaveLength(before);
    expect((await history(t.base, t.as, a3))[0]?.text).toBe(
      "Owner's payment to the GC for application #3 recorded as 2026-03-05",
    );
  });

  it("is all or nothing: a draft, a date before a period or other terms refuse the whole batch", async () => {
    const t = await threeApps(2);
    const [a1, a2, draft] = t.ids as [string, string, string];
    const put = (payAppIds: string[], ownerPaidOn: string, as = t.as) =>
      api(t.path, { method: "PUT", as, json: { payAppIds, ownerPaidOn } });
    const unchanged = async () => {
      const p = await call<ProjectDetailDto>(t.base, { as: t.as });
      expect(p.payApps.map((a) => a.ownerPaidOn)).toEqual([null, null, null]);
    };

    let res = await put([a1, a2, draft], "2026-03-05");
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/Application #3: Submit/);
    await unchanged();

    res = await put([a1, a2], "2026-01-20");
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/Application #2: .*before the period/);
    await unchanged();

    expect((await put([a1, a1], "2026-03-05")).status).toBe(400);
    expect((await put([], "2026-03-05")).status).toBe(400);
    expect((await put([a1, "pa_nope"], "2026-03-05")).status).toBe(404);
    await unchanged();

    await call(t.base, {
      method: "PATCH",
      as: t.as,
      json: { payTermsDays: 30, payTermsBasis: "application_date" },
    });
    res = await put([a1, a2], "2026-03-05");
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/pay-when-paid/);
    await unchanged();
  });

  it("viewers cannot record it; another org cannot reach the job's applications", async () => {
    const t = await threeApps(2);
    const json = { payAppIds: t.ids.slice(0, 2), ownerPaidOn: "2026-03-05" };
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await api(t.path, { method: "PUT", as: viewer.id, json })).status).toBe(403);

    const other = await setupTenant("owner");
    expect((await api(t.path, { method: "PUT", as: other.userId, json })).status).toBe(404);
    expect(
      (await api(t.path.replace(t.orgId, other.orgId), { method: "PUT", as: other.userId, json }))
        .status,
    ).toBe(404);

    // Another org's own job cannot take this job's application ids.
    const theirs = await threeApps(2);
    const res = await api(theirs.path, {
      method: "PUT",
      as: theirs.as,
      json: { payAppIds: [theirs.ids[0], t.ids[0]], ownerPaidOn: "2026-03-05" },
    });
    expect(res.status).toBe(404);
    const p = await call<ProjectDetailDto>(t.base, { as: t.as });
    expect(p.payApps.map((a) => a.ownerPaidOn)).toEqual([null, null, null]);
  });
});
