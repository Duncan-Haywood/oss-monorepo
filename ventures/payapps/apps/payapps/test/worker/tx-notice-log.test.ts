// Texas notices of claim sent, through the HTTP API: tracking a job (residential or not), the
// unpaid months read from its sent pay apps with each month's § 53.056 date, a notice recorded per
// recipient and month with its timing, the cash report's reminder until both recipients have one,
// the job history, the plan and role gates, and tenant isolation.

import { txMonthlyNoticeDue } from "@lien-waivers";
import type {
  JobEventDto,
  NoticeOverviewDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  TxNoticeSendDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let projectId: string;

const today = () => new Date().toISOString().slice(0, 10);
const monthOffset = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 7);
};
const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today())) / 86_400_000);
/** A past month whose (non-residential) notice is due within the next 30 days. */
const dueSoonMonth = () => {
  for (let n = -4; n <= 0; n++) {
    const m = monthOffset(n);
    const d = daysTo(txMonthlyNoticeDue(m, false).due);
    if (d >= 0 && d <= 30) return m;
  }
  throw new Error("no month due within 30 days");
};
let workMonth: string;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mueller Clinic Fit-Out",
      location: "1900 Aldrich St, Austin TX 78723",
      gcName: "Capitol Builders Inc.",
      gcAddress: "500 W 2nd St, Austin TX 78701",
      ownerName: "Mueller Clinic Holdings LLC",
      originalContractSumCents: 1_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  // One sent pay app for a month whose notice is due soon, $5,000 of work, nothing paid.
  workMonth = dueSoonMonth();
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Framing", originalCents: 1_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      periodFrom: `${workMonth}-01`,
      periodTo: `${workMonth}-28`,
      applicationDate: `${workMonth}-28`,
    },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: project.sovLines[0]?.id ?? "",
          workThisPeriodCents: 500_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
});

const overview = (user = as) => call<NoticeOverviewDto>(`${base}/notices?state=TX`, { as: user });
const SEND = {
  kind: "labor-materials",
  recipient: "owner",
  recipientNameAddress: "Mueller Clinic Holdings LLC\n1900 Aldrich St, Austin TX 78723",
  method: "certified-mail",
  tracking: "9589 0710 5270 1111 2222 33",
};
const setKind = (projectKind: string | null) =>
  call(`${base}/notices/tx/project-kind`, { method: "PUT", as, json: { projectKind } });
const record = (json: Record<string, unknown>) =>
  call<TxNoticeSendDto>(`${base}/notices/tx/sends`, {
    method: "POST",
    as,
    expect: 201,
    json: { ...SEND, ...json },
  });
const cashActions = async () => {
  const r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
  return (r.projects.find((p) => p.id === projectId)?.actions ?? []).join(" ");
};
const history = () =>
  call<{ items: JobEventDto[] }>(`${base}/history`, { as }).then((r) => r.items);

describe("Texas notices of claim sent", () => {
  it("on Free: the log shows untracked, recording needs Crew (402); only Texas gets it", async () => {
    const o = await overview();
    expect(o.tx).not.toBeNull();
    expect(o.tx?.projectKind).toBeNull();
    expect(o.tx?.unpaidMonths).toEqual([]);
    expect(o.tx?.recipientPrefill.owner).toBe("Mueller Clinic Holdings LLC");
    expect(o.tx?.recipientPrefill["original-contractor"]).toContain("Capitol Builders Inc.");
    expect(o.tx?.methods.map((m) => m.id)).toEqual([
      "certified-mail",
      "in-person",
      "traceable-private",
    ]);
    const res = await api(`${base}/notices/tx/sends`, {
      method: "POST",
      as,
      json: { ...SEND, workMonth, sentOn: today() },
    });
    expect(res.status).toBe(402);
    expect((await call<NoticeOverviewDto>(`${base}/notices?state=FL`, { as })).tx).toBeNull();
  });

  it("tracking reads the unpaid month from the pay app and turns on the reminder", async () => {
    await grantPlan(orgId, "crew", "active");
    expect(await cashActions()).not.toMatch(/Texas notice of claim/);
    await setKind("commercial");
    const o = await overview();
    expect(o.tx?.projectKind).toBe("commercial");
    const due = txMonthlyNoticeDue(workMonth, false).due;
    expect(o.tx?.unpaidMonths).toEqual([
      expect.objectContaining({
        workMonth,
        payAppNumbers: [1],
        unpaidCents: 450_000, // $5,000 less 10% retainage
        dueOn: due,
        missing: ["owner", "original-contractor"],
      }),
    ]);
    const a = await cashActions();
    expect(a).toContain(`Texas notice of claim for `);
    expect(a).toContain(`(pay app 1, $4,500.00 unpaid) is due`);
    expect(a).toContain(`by ${due}`);
    expect(a).toContain("none is recorded for the owner and the original contractor");
  });

  it("a notice per recipient: timing, the reminder narrows, then stops", async () => {
    const s = await record({ workMonth, sentOn: today(), amountCents: 450_000 });
    expect(s.onTime).toBe(true);
    expect(s.timing).toMatch(/^On time: deposited in the mail, which complies \(§ 53\.003\(c\)\)/);
    expect(s.amountCents).toBe(450_000);
    let a = await cashActions();
    expect(a).toContain("none is recorded for the original contractor.");
    expect(a).not.toContain("for the owner and");
    await record({
      workMonth,
      recipient: "original-contractor",
      recipientNameAddress: "Capitol Builders Inc.\n500 W 2nd St, Austin TX 78701",
      method: "in-person",
      tracking: null,
      sentOn: today(),
    });
    a = await cashActions();
    expect(a).not.toMatch(/Texas notice of claim/);
    const o = await overview();
    expect(o.tx?.sends).toHaveLength(2);
    expect(o.tx?.unpaidMonths[0]?.missing).toEqual([]);
  });

  it("a late notice says so; a retainage notice has no month; bad input is a 400", async () => {
    const late = await record({ workMonth: "2025-01", sentOn: today() });
    expect(late.onTime).toBe(false);
    expect(late.timing).toMatch(/^Late:/);
    const ret = await record({ kind: "retainage", workMonth: "2026-01", sentOn: today() });
    expect(ret.workMonth).toBeNull();
    expect(ret.onTime).toBeNull();
    for (const json of [
      { ...SEND, sentOn: today() }, // no month for a § 53.056 notice
      { ...SEND, workMonth: "2026-13", sentOn: today() },
      { ...SEND, workMonth, sentOn: "2026-02-30" },
      { ...SEND, workMonth, sentOn: today(), method: "fax" },
      { ...SEND, workMonth, sentOn: today(), recipient: "lender" },
    ]) {
      const res = await api(`${base}/notices/tx/sends`, { method: "POST", as, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    for (const id of [late.id, ret.id]) {
      await call(`${base}/notices/tx/sends/${id}`, { method: "DELETE", as });
    }
  });

  it("the job history records each change", async () => {
    const texts = (await history()).map((e) => e.text);
    expect(texts).toContain("Texas notices of claim tracked, as a project other than residential");
    expect(
      texts.some((t) =>
        t.startsWith(
          `Texas notice of claim for ${workMonth} work to the owner by certified mail on ${today()}, tracking number 9589`,
        ),
      ),
    ).toBe(true);
    expect(texts).toContain(
      `Texas notice of claim for ${workMonth} work to the original contractor in person on ${today()} recorded as sent`,
    );
    expect(texts).toContain(
      `Texas notice of claim for unpaid retainage to the owner by certified mail on ${today()}, tracking number 9589 0710 5270 1111 2222 33: record deleted`,
    );
  });

  it("residential moves the date a month earlier; untracking stops the reminder", async () => {
    await setKind("residential");
    const o = await overview();
    expect(o.tx?.unpaidMonths[0]?.dueOn).toBe(txMonthlyNoticeDue(workMonth, true).due);
    await setKind(null);
    expect((await overview()).tx?.unpaidMonths).toEqual([]);
    expect(await cashActions()).not.toMatch(/Texas notice of claim/);
    expect((await history()).map((e) => e.text)).toContain(
      "Texas notices of claim no longer tracked",
    );
  });

  it("viewers read but cannot record; another org sees 404", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await overview(viewer.id)).tx?.sends.length).toBe(2);
    const res = await api(`${base}/notices/tx/sends`, {
      method: "POST",
      as: viewer.id,
      json: { ...SEND, workMonth, sentOn: today() },
    });
    expect(res.status).toBe(403);
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const crossed = base.replace(orgId, other.orgId);
    const sendId = (await overview()).tx?.sends[0]?.id ?? "";
    for (const [path, init] of [
      [
        `${crossed}/notices/tx/project-kind`,
        { method: "PUT", json: { projectKind: "commercial" } },
      ],
      [
        `${crossed}/notices/tx/sends`,
        { method: "POST", json: { ...SEND, workMonth, sentOn: today() } },
      ],
      [`${crossed}/notices/tx/sends/${sendId}`, { method: "DELETE" }],
    ] as const) {
      expect((await api(path, { ...init, as: other.userId })).status).toBe(404);
    }
    // Their own job cannot delete our record either.
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 100 },
    });
    const del = await api(
      `/api/orgs/${other.orgId}/projects/${theirs.id}/notices/tx/sends/${sendId}`,
      {
        method: "DELETE",
        as: other.userId,
      },
    );
    expect(del.status).toBe(404);
    expect((await overview()).tx?.sends.length).toBe(2);
  });
});
