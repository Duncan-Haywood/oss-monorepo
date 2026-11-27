// Texas notices of claim (Tex. Prop. Code § 53.056) through the HTTP API: both statutory forms
// offered and printed for TX, the job turned on as residential or not, each unpaid application's
// date from its period, the cash report's reminder until a notice is recorded, recording and
// clearing (with the job history), the plan and role gates, and tenant isolation.
import type {
  JobEventDto,
  NoticeOverviewDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let projectId: string;
let appId: string;

// A $240,000 job; application #1 bills October 26 to November 25, 2025: $50,000 of work, 10%
// retainage, so $45,000 is due. October is the governing month: commercial, by 2026-01-15
// (a Thursday); residential, by 2025-12-15.
beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      location: "1200 E 7th St, Austin TX 78702",
      gcName: "Hill Country Builders Inc.",
      ownerName: "Riverside Health Partners LLC",
      originalContractSumCents: 24_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Electrical", originalCents: 24_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2025-10-26", periodTo: "2025-11-25", applicationDate: "2025-11-25" },
  });
  appId = app.id;
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: project.sovLines[0]?.id ?? "",
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
});

const overview = (user = as, state = "TX") =>
  call<NoticeOverviewDto>(`${base}/notices?state=${state}`, { as: user });
const setKind = (kind: string | null, user = as) =>
  api(`${base}/notices/tx/kind`, { method: "PUT", as: user, json: { kind } });
const setSent = (sent: { sentOn: string; method: string } | null, id = appId) =>
  api(`${base}/notices/tx/pay-apps/${id}`, { method: "PUT", as, json: { sent } });
const cashActions = async () => {
  const r = await call<CashReport>(`/api/orgs/${orgId}/reports/cash`, { as });
  return (r.projects.find((p) => p.id === projectId)?.actions ?? []).join(" ");
};
const history = () =>
  call<{ items: JobEventDto[] }>(`${base}/history`, { as }).then((r) => r.items.map((e) => e.text));

describe("Texas notices of claim", () => {
  it("offers both statutory forms for TX, prefilled from the job; turning on needs Crew", async () => {
    const o = await overview();
    expect(o.notices.map((n) => n.id)).toEqual([
      "TX/notice-of-claim/unpaid-labor-or-materials",
      "TX/notice-of-claim/unpaid-retainage",
    ]);
    expect(o.prefill.originalContractor).toBe("Hill Country Builders Inc.");
    expect(o.prefill.projectDescription).toBe("Riverside Clinic, 1200 E 7th St, Austin TX 78702");
    expect(o.tx?.kind).toBeNull();
    expect(o.tx?.claims).toEqual([]);
    expect(o.tx?.methods.map((m) => m.id)).toEqual([
      "certified-mail",
      "in-person",
      "traceable-delivery",
    ]);
    expect((await overview(as, "FL")).tx).toBeNull();
    expect((await setKind("commercial")).status).toBe(402);
  });

  it("prints the § 53.056 notice as a PDF", async () => {
    await grantPlan(orgId, "crew", "active");
    const res = await api(`${base}/notices/notice.pdf`, {
      method: "POST",
      as,
      json: {
        state: "TX",
        formId: "TX/notice-of-claim/unpaid-labor-or-materials",
        fields: {
          signedDate: "2025-12-01",
          projectDescription: "Riverside Clinic, 1200 E 7th St, Austin TX 78702",
          claimantName: "Lone Star Electric LLC",
          workType: "Electrical, labor and materials",
          originalContractor: "Hill Country Builders Inc.",
          claimAmount: "$45,000.00",
          claimantContact: "Dana Ruiz",
          claimantAddress: "400 Congress Ave, Austin TX 78701",
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("a draft has no date; once submitted and unpaid, its date and the reminder follow", async () => {
    expect((await setKind("commercial")).status).toBe(200);
    expect((await overview()).tx?.claims).toEqual([]);
    expect((await setSent({ sentOn: "2025-12-01", method: "certified-mail" })).status).toBe(400);
    await call(`${base}/pay-apps/${appId}/submit`, { method: "POST", as });
    const o = await overview();
    expect(o.tx?.kind).toBe("commercial");
    expect(o.tx?.claims).toHaveLength(1);
    const c = o.tx?.claims[0];
    expect(c?.number).toBe(1);
    expect(c?.month).toBe("2025-10");
    expect(c?.dueOn).toBe("2026-01-15");
    expect(c?.weekendExtendedTo).toBeNull();
    expect(c?.unpaidCents).toBe(4_500_000);
    expect(c?.status).toBe("late");
    const a = await cashActions();
    expect(a).toContain(
      "Texas notice of claim for application #1 ($45,000.00 unpaid, work from October 2025) was due 2026-01-15 and none is recorded.",
    );
    expect(a).toContain("Tex. Prop. Code § 53.056(a)");
  });

  it("residential moves the date a month earlier", async () => {
    await setKind("residential");
    expect((await overview()).tx?.claims[0]?.dueOn).toBe("2025-12-15");
    await setKind("commercial");
  });

  it("recording a notice ends the reminder; clearing it brings it back; both are in the history", async () => {
    expect((await setSent({ sentOn: "2025-10-01", method: "certified-mail" })).status).toBe(400);
    expect((await setSent({ sentOn: "2025-12-10", method: "certified-mail" })).status).toBe(200);
    const c = (await overview()).tx?.claims[0];
    expect(c?.status).toBe("sent");
    expect(c?.sentOn).toBe("2025-12-10");
    expect(c?.method).toBe("certified-mail");
    expect(await cashActions()).not.toMatch(/Texas notice of claim/);
    expect((await setSent(null)).status).toBe(200);
    expect(await cashActions()).toMatch(/Texas notice of claim/);
    const texts = await history();
    expect(texts).toContain(
      "Texas notices of claim turned on: not residential (third month), Tex. Prop. Code § 53.056(a-1)",
    );
    expect(texts).toContain(
      "Texas notice of claim for application #1 recorded as sent by certified mail on 2025-12-10",
    );
    expect(texts).toContain("Texas notice of claim for application #1: record cleared");
  });

  it("paid in full: no date and no reminder; turned off: nothing", async () => {
    await call(`${base}/pay-apps/${appId}/mark-paid`, {
      method: "POST",
      as,
      json: { receivedOn: "2026-01-05" },
    });
    expect((await overview()).tx?.claims).toEqual([]);
    expect(await cashActions()).not.toMatch(/Texas notice of claim/);
    expect((await setKind(null)).status).toBe(200);
    expect((await overview()).tx?.kind).toBeNull();
    expect(await history()).toContain("Texas notices of claim turned off for this job");
  });

  it("a viewer cannot record; another company cannot see or change the job", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await setKind("commercial", viewer.id)).status).toBe(403);
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const res = await api(`${base}/notices/tx/kind`, {
      method: "PUT",
      as: other.userId,
      json: { kind: "commercial" },
    });
    expect([403, 404]).toContain(res.status);
    const res2 = await api(`/api/orgs/${other.orgId}/projects/${projectId}/notices/tx/kind`, {
      method: "PUT",
      as: other.userId,
      json: { kind: "commercial" },
    });
    expect(res2.status).toBe(404);
  });
});
