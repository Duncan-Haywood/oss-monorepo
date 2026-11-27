// California preliminary notices given, through the HTTP API: the first-furnished date and the
// § 8204(a) due date, recording a notice per person (on time and late, § 8116(c)'s five days for a
// notice left and mailed), the § 8118 proof of notice PDF, the cash report's reminder until the
// owner and direct contractor each have one, the plan and role gates, and tenant isolation.

import type { CaNoticeSendDto, NoticeOverviewDto, ProjectDto } from "@shared/api/types";
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
      name: "Valley Clinic TI",
      location: "2100 Tulare St, Fresno CA 93721",
      gcName: "Sierra Builders Inc.",
      gcAddress: "500 Van Ness Ave, Fresno CA 93721",
      ownerName: "Valley Medical Partners LLC",
      originalContractSumCents: 18_000_000,
    },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
});

const overview = (user = as) => call<NoticeOverviewDto>(`${base}/notices?state=CA`, { as: user });
const SEND = {
  recipient: "owner",
  recipientNameAddress: "Valley Medical Partners LLC\n2100 Tulare St, Fresno CA 93721",
  method: "certified-mail",
  place: "Fresno, California",
  tracking: "9407 1111 2222",
};
const cashActions = async () => {
  const r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
  return r.projects.find((p) => p.id === projectId)?.actions ?? [];
};

describe("California notices given", () => {
  it("on Free: the log shows, recording needs Crew (402)", async () => {
    const o = await overview();
    expect(o.ca).not.toBeNull();
    expect(o.ca?.sends).toEqual([]);
    expect(o.ca?.missing).toEqual(["owner", "direct-contractor"]);
    expect(o.ca?.recipientPrefill.owner).toBe("Valley Medical Partners LLC");
    expect(o.ca?.methods.map((m) => m.id)).toContain("leave-and-mail");
    const res = await api(`${base}/notices/ca/sends`, {
      method: "POST",
      as,
      json: { ...SEND, givenOn: day(0) },
    });
    expect(res.status).toBe(402);
    // Only California gets the log.
    expect((await call<NoticeOverviewDto>(`${base}/notices?state=WY`, { as })).ca).toBeNull();
  });

  it("first-furnished date: the due date, and a reminder on the cash report", async () => {
    await grantPlan(orgId, "crew", "active");
    expect((await cashActions()).join(" ")).not.toMatch(/preliminary notice/);
    await call(`${base}/notices/ca/first-furnished`, {
      method: "PUT",
      as,
      json: { firstFurnishedOn: day(-15) },
    });
    const o = await overview();
    expect(o.ca?.firstFurnishedOn).toBe(day(-15));
    expect(o.ca?.dueOn).toBe(day(5));
    const actions = (await cashActions()).join(" ");
    expect(actions).toContain(`California preliminary notice due in 5 days, by ${day(5)}`);
    expect(actions).toContain("the owner or the direct contractor");
  });

  it("records an on-time notice to the owner and prints its § 8118 proof", async () => {
    const s = await call<CaNoticeSendDto>(`${base}/notices/ca/sends`, {
      method: "POST",
      as,
      expect: 201,
      json: { ...SEND, givenOn: day(-2) },
    });
    expect(s.onTime).toBe(true);
    expect(s.completeOn).toBe(day(-2));
    const o = await overview();
    expect(o.ca?.missing).toEqual(["direct-contractor"]);
    const actions = (await cashActions()).join(" ");
    expect(actions).toContain("none recorded yet for the direct contractor.");

    const res = await api(
      `${base}/notices/ca/sends/${s.id}/proof.pdf?declarant=${encodeURIComponent("Dana Ruiz, office manager")}`,
      { as },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("proof-of-notice-owner.pdf");
    const body = await res.text();
    expect(body.startsWith("%PDF-")).toBe(true);
    expect(body).toContain("PROOF OF NOTICE DECLARATION");
    expect(body).toContain("Valley Medical Partners LLC");
    expect(body).toContain("9407 1111 2222");
    expect(body).toContain("Dana Ruiz, office manager");
    expect(body).toContain("United States Postal Service");
  });

  it("a notice left and mailed is complete five days later, and can be late", async () => {
    await call(`${base}/notices/ca/first-furnished`, {
      method: "PUT",
      as,
      json: { firstFurnishedOn: day(-30) },
    });
    const s = await call<CaNoticeSendDto>(`${base}/notices/ca/sends`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        ...SEND,
        recipient: "direct-contractor",
        recipientNameAddress: "Sierra Builders Inc.\n500 Van Ness Ave, Fresno CA 93721",
        method: "leave-and-mail",
        givenOn: day(-12),
        tracking: null,
      },
    });
    expect(s.completeOn).toBe(day(-7));
    expect(s.onTime).toBe(false);
    expect(s.coversWorkFrom).toBe(day(-27));
    const o = await overview();
    expect(o.ca?.missing).toEqual([]);
    // The owner's notice, given 28 days after first furnishing, is now late too.
    expect(o.ca?.sends.find((x) => x.recipient === "owner")?.onTime).toBe(false);
    expect((await cashActions()).join(" ")).not.toMatch(/preliminary notice/);
  });

  it("deleting a record brings the reminder back, worded for a past due date", async () => {
    const o = await overview();
    const dc = o.ca?.sends.find((x) => x.recipient === "direct-contractor");
    await call(`${base}/notices/ca/sends/${dc?.id}`, { method: "DELETE", as });
    const actions = (await cashActions()).join(" ");
    expect(actions).toContain(`California preliminary notice was due ${day(-10)}`);
    expect(actions).toContain("covers work from 20 days before it is given");
    // Clearing the date stops it.
    await call(`${base}/notices/ca/first-furnished`, {
      method: "PUT",
      as,
      json: { firstFurnishedOn: null },
    });
    expect((await cashActions()).join(" ")).not.toMatch(/preliminary notice/);
    expect((await overview()).ca?.dueOn).toBeNull();
  });

  it("refuses bad input", async () => {
    const bad = await api(`${base}/notices/ca/sends`, {
      method: "POST",
      as,
      json: { ...SEND, givenOn: day(0), method: "email" },
    });
    expect(bad.status).toBe(400);
    const blank = await api(`${base}/notices/ca/sends`, {
      method: "POST",
      as,
      json: { ...SEND, givenOn: day(0), place: " " },
    });
    expect(blank.status).toBe(400);
    const date = await api(`${base}/notices/ca/first-furnished`, {
      method: "PUT",
      as,
      json: { firstFurnishedOn: "2026-02-31" },
    });
    expect(date.status).toBe(400);
  });

  it("viewers read and print but cannot record; another org sees 404", async () => {
    const owner = (await overview()).ca?.sends[0];
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await overview(viewer.id)).ca?.sends.length).toBe(1);
    const proof = await api(`${base}/notices/ca/sends/${owner?.id}/proof.pdf`, { as: viewer.id });
    expect(proof.status).toBe(200);
    const denied = await api(`${base}/notices/ca/sends`, {
      method: "POST",
      as: viewer.id,
      json: { ...SEND, givenOn: day(0) },
    });
    expect(denied.status).toBe(403);

    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const crossed = base.replace(orgId, other.orgId);
    for (const [path, init] of [
      [`${crossed}/notices/ca/sends/${owner?.id}/proof.pdf`, {}],
      [`${crossed}/notices/ca/sends/${owner?.id}`, { method: "DELETE" }],
      [
        `${crossed}/notices/ca/first-furnished`,
        { method: "PUT", json: { firstFurnishedOn: day(0) } },
      ],
      [`${crossed}/notices/ca/sends`, { method: "POST", json: { ...SEND, givenOn: day(0) } }],
    ] as const) {
      expect((await api(path, { ...init, as: other.userId })).status).toBe(404);
    }
    // Their own job id with our send id: still not found.
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "X", gcName: "Y", originalContractSumCents: 100 },
    });
    const res = await api(
      `/api/orgs/${other.orgId}/projects/${theirs.id}/notices/ca/sends/${owner?.id}/proof.pdf`,
      { as: other.userId },
    );
    expect(res.status).toBe(404);
    expect((await overview()).ca?.sends.length).toBe(1);
  });
});
