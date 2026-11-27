// Florida Notices to Owner served, through the HTTP API: the first-furnished date saved with the job
// and the § 713.06(2)(a) 45-day and § 713.18(2) 40-day dates, a notice recorded per person (served
// on mailing within 40 days; after that, or by carrier, on the delivery date entered later), the
// cash report's reminder until the owner has one (worded for each window and once the 45 days
// pass), the job history, the plan and role gates, and tenant isolation.

import type {
  FlNoticeSendDto,
  JobEventDto,
  NoticeOverviewDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let projectId: string;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Bayshore Medical Office",
      location: "4100 W Kennedy Blvd, Tampa FL 33609",
      gcName: "Gulf Coast Builders LLC",
      gcAddress: "200 N Ashley Dr, Tampa FL 33602",
      ownerName: "Bayshore MOB Holdings LLC",
      originalContractSumCents: 24_000_000,
    },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
});

const overview = (user = as) => call<NoticeOverviewDto>(`${base}/notices?state=FL`, { as: user });
const SEND = {
  recipient: "owner",
  recipientNameAddress: "Bayshore MOB Holdings LLC\n4100 W Kennedy Blvd, Tampa FL 33609",
  method: "certified-mail",
  tracking: "9589 0710 5270 0000 0000 00",
};
const setFirst = (firstFurnishedOn: string | null) =>
  call(`${base}/notices/fl/first-furnished`, { method: "PUT", as, json: { firstFurnishedOn } });
const record = (json: Record<string, unknown>) =>
  call<FlNoticeSendDto>(`${base}/notices/fl/sends`, {
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

describe("Florida notices served", () => {
  it("on Free: the log shows, recording needs Crew (402); only Florida gets it", async () => {
    const o = await overview();
    expect(o.fl).not.toBeNull();
    expect(o.fl?.sends).toEqual([]);
    expect(o.fl?.missing).toEqual(["owner"]);
    expect(o.fl?.recipientPrefill.owner).toBe("Bayshore MOB Holdings LLC");
    expect(o.fl?.recipientPrefill.contractor).toContain("Gulf Coast Builders LLC");
    expect(o.fl?.methods.map((m) => m.id)).toContain("global-express-guaranteed");
    const res = await api(`${base}/notices/fl/sends`, {
      method: "POST",
      as,
      json: { ...SEND, sentOn: day(0) },
    });
    expect(res.status).toBe(402);
    expect((await call<NoticeOverviewDto>(`${base}/notices?state=CA`, { as })).fl).toBeNull();
    expect((await overview()).ca).toBeNull();
  });

  it("first-furnished date: saved, the two dates, and the reminder's three wordings", async () => {
    await grantPlan(orgId, "crew", "active");
    expect(await cashActions()).not.toMatch(/Notice to Owner/);
    await setFirst(day(-30));
    const o = await overview();
    expect(o.fl?.firstFurnishedOn).toBe(day(-30));
    expect(o.fl?.mailBy).toBe(day(10));
    expect(o.fl?.serveBy).toBe(day(15));
    let a = await cashActions();
    expect(a).toContain(`Mail it by certified or registered mail in 10 days, by ${day(10)}`);
    expect(a).toContain(`must be served by ${day(15)}`);
    await setFirst(day(-42));
    a = await cashActions();
    expect(a).toContain(`must be served in 3 days, by ${day(3)}`);
    expect(a).toContain("Past the 40 days, mail counts only when delivered");
    await setFirst(day(-50));
    a = await cashActions();
    expect(a).toContain(`Florida Notice to Owner was due ${day(-5)}`);
    expect(a).toContain("a complete defense to enforcement of a lien");
    // Clearing the date stops it; the history has each change.
    await setFirst(null);
    expect(await cashActions()).not.toMatch(/Notice to Owner/);
    const texts = (await history()).map((e) => e.text);
    expect(texts).toContain(`Day first furnished work (Florida § 713.06(2)(a)) set to ${day(-50)}`);
    expect(texts).toContain("Day first furnished work (Florida § 713.06(2)(a)) cleared");
  });

  it("certified mail within 40 days is served on mailing and ends the reminder", async () => {
    await setFirst(day(-20));
    const s = await record({ sentOn: day(-2) });
    expect(s.servedOn).toBe(day(-2));
    expect(s.basis).toBe("mailing");
    expect(s.onTime).toBe(true);
    expect(s.timing).toContain("§ 713.18(2)");
    const o = await overview();
    expect(o.fl?.missing).toEqual([]);
    expect(o.fl?.sends).toHaveLength(1);
    expect(await cashActions()).not.toMatch(/Notice to Owner/);
    const h = (await history()).find((e) => e.action === "fl_notice_recorded");
    expect(h?.text).toBe(
      `Florida Notice to Owner to the owner recorded as served by certified mail on ${day(-2)}, tracking number ${SEND.tracking}`,
    );
  });

  it("a copy by carrier counts when delivered; the delivery date is entered later", async () => {
    const s = await record({
      recipient: "contractor",
      recipientNameAddress: "Gulf Coast Builders LLC\n200 N Ashley Dr, Tampa FL 33602",
      method: "common-carrier",
      sentOn: day(-1),
      tracking: "1Z999AA10123456784",
    });
    expect(s.basis).toBe("delivery");
    expect(s.servedOn).toBeNull();
    expect(s.onTime).toBeNull();
    expect(s.timing).toContain("Enter the delivery date");
    const d = await call<FlNoticeSendDto>(`${base}/notices/fl/sends/${s.id}`, {
      method: "PATCH",
      as,
      json: { deliveredOn: day(0) },
    });
    expect(d.servedOn).toBe(day(0));
    expect(d.onTime).toBe(true);
    // Before it was sent: refused.
    const bad = await api(`${base}/notices/fl/sends/${s.id}`, {
      method: "PATCH",
      as,
      json: { deliveredOn: day(-5) },
    });
    expect(bad.status).toBe(400);
    expect((await history()).map((e) => e.text)).toContain(
      `Florida Notice to Owner to the contractor: delivery date set to ${day(0)}`,
    );
  });

  it("moving the first day later re-reads each record; deleting the owner's brings the reminder back", async () => {
    // First day 60 days ago: the owner's notice, mailed 2 days ago, is past the 40 days, so it is
    // served only when delivered (none entered).
    await setFirst(day(-60));
    const o = await overview();
    const owner = o.fl?.sends.find((x) => x.recipient === "owner");
    expect(owner?.basis).toBe("delivery");
    expect(owner?.onTime).toBeNull();
    const contractor = o.fl?.sends.find((x) => x.recipient === "contractor");
    expect(contractor?.onTime).toBe(false);
    expect(contractor?.timing).toContain("complete defense");
    await setFirst(day(-20));
    await call(`${base}/notices/fl/sends/${owner?.id}`, { method: "DELETE", as });
    expect((await overview()).fl?.missing).toEqual(["owner"]);
    expect(await cashActions()).toContain(
      "Florida Notice to Owner: none recorded yet for the owner",
    );
    expect((await history()).map((e) => e.action)).toContain("fl_notice_deleted");
  });

  it("refuses bad input", async () => {
    for (const json of [
      { ...SEND, sentOn: day(0), method: "email" },
      { ...SEND, sentOn: day(0), recipient: "architect" },
      { ...SEND, sentOn: day(0), recipientNameAddress: " " },
      { ...SEND, sentOn: "2026-02-31" },
      { ...SEND, sentOn: day(0), deliveredOn: day(-1) },
    ]) {
      const res = await api(`${base}/notices/fl/sends`, { method: "POST", as, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    const date = await api(`${base}/notices/fl/first-furnished`, {
      method: "PUT",
      as,
      json: { firstFurnishedOn: "2026-02-31" },
    });
    expect(date.status).toBe(400);
  });

  it("viewers read but cannot record; another org sees 404", async () => {
    const mine = (await overview()).fl?.sends[0];
    expect(mine).toBeDefined();
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await overview(viewer.id)).fl?.sends.length).toBe(1);
    const denied = await api(`${base}/notices/fl/sends`, {
      method: "POST",
      as: viewer.id,
      json: { ...SEND, sentOn: day(0) },
    });
    expect(denied.status).toBe(403);

    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const crossed = base.replace(orgId, other.orgId);
    for (const [path, init] of [
      [`${crossed}/notices/fl/sends/${mine?.id}`, { method: "DELETE" }],
      [`${crossed}/notices/fl/sends/${mine?.id}`, { method: "PATCH", json: { deliveredOn: null } }],
      [
        `${crossed}/notices/fl/first-furnished`,
        { method: "PUT", json: { firstFurnishedOn: day(0) } },
      ],
      [`${crossed}/notices/fl/sends`, { method: "POST", json: { ...SEND, sentOn: day(0) } }],
    ] as const) {
      expect((await api(path, { ...init, as: other.userId })).status).toBe(404);
    }
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "X", gcName: "Y", originalContractSumCents: 100 },
    });
    const res = await api(
      `/api/orgs/${other.orgId}/projects/${theirs.id}/notices/fl/sends/${mine?.id}`,
      { method: "DELETE", as: other.userId },
    );
    expect(res.status).toBe(404);
    expect((await overview()).fl?.sends.length).toBe(1);
  });
});
