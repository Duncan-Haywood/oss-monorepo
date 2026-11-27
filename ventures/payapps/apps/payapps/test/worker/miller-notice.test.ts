// The Miller Act 90-day notice (services/payapps/miller-notice.ts) through the HTTP API on a real
// local D1: who needs it by tier, the prefill from the job (the company, the party billed, the saved
// last day, the unpaid amount with retainage from the cash report), the plan gate, the PDF, field
// errors, a non-federal job refused, and tenant isolation.
import type {
  MillerNoticeDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { addDays } from "@shared/lien-deadline";
import { describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function billedFederalJob(orgId: string, as: string) {
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Building LP-14 renovation",
      location: "Naval Station Norfolk, VA",
      gcName: "Bayside Mechanical Inc.",
      gcAddress: "88 Harbor Rd, Norfolk VA 23505",
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
  const from = addDays(today(), -60);
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: from, periodTo: addDays(from, 20), applicationDate: addDays(from, 20) },
  });
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
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  return base;
}

const FIELDS = {
  noticeDate: "2026-11-27",
  primeContractor: "Granite Federal Builders Inc.\n400 Commerce St, Norfolk VA 23510",
  project: "Building LP-14 renovation, Naval Station Norfolk",
  claimant: "Tidewater Electric LLC",
  furnishedTo: "Bayside Mechanical Inc.",
  amountClaimed: "$50,000.00",
  lastDay: "2026-10-02",
};

describe("Miller Act notice", () => {
  it("prefills from a federal job, needs Crew to print, and prints the PDF", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const base = await billedFederalJob(orgId, as);

    // A private job: the overview says so, and printing is refused.
    let o = await call<MillerNoticeDto>(`${base}/notices/miller`, { as });
    expect(o.applies).toBe("not-federal");

    const last = addDays(today(), -30);
    await call(base, {
      method: "PATCH",
      as,
      json: { lienState: "VA", publicOwner: "federal", lastFurnishedOn: last },
    });
    o = await call<MillerNoticeDto>(`${base}/notices/miller`, { as });
    expect(o.applies).toBe("unsure");
    expect(o.enabled).toBe(false);
    expect(o.notice.citation).toBe("40 U.S.C. § 3133(b)(2)");
    // Billed $50,000 with 10% retainage, nothing paid: $45,000 owed plus $5,000 held.
    expect(o.outstandingCents).toBe(4_500_000);
    expect(o.retainageHeldCents).toBe(500_000);
    expect(o.prefill).toMatchObject({
      amountClaimed: "$50,000.00",
      lastDay: last,
      furnishedTo: "Bayside Mechanical Inc.\n88 Harbor Rd, Norfolk VA 23505",
      project: "Building LP-14 renovation\nNaval Station Norfolk, VA",
      claimant: "Test Mechanical",
    });
    expect(o.prefill).not.toHaveProperty("primeContractor");
    expect(o.noticeDueOn).not.toBeNull();
    const free = await api(`${base}/notices/miller.pdf`, {
      method: "POST",
      as,
      json: { fields: FIELDS },
    });
    expect(free.status).toBe(402);

    await grantPlan(orgId, "crew", "active");
    await call(base, { method: "PATCH", as, json: { millerTier: "second" } });
    o = await call<MillerNoticeDto>(`${base}/notices/miller`, { as });
    expect(o.enabled).toBe(true);
    expect(o.applies).toBe("needed");
    const res = await api(`${base}/notices/miller.pdf`, {
      method: "POST",
      as,
      json: { fields: FIELDS },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("miller-act-notice.pdf");
    const body = await res.text();
    expect(body.startsWith("%PDF-")).toBe(true);
    expect(body).toContain("NOTICE OF CLAIM ON PAYMENT BOND");
    expect(body).toContain("Granite Federal Builders Inc.");

    // A missing amount is a field error; the first and remote tiers say they need no notice.
    const bad = await api(`${base}/notices/miller.pdf`, {
      method: "POST",
      as,
      json: { fields: { ...FIELDS, amountClaimed: "" } },
    });
    expect(bad.status).toBe(400);
    await call(base, { method: "PATCH", as, json: { millerTier: "first" } });
    o = await call<MillerNoticeDto>(`${base}/notices/miller`, { as });
    expect(o.applies).toBe("not-needed");
    await call(base, { method: "PATCH", as, json: { millerTier: "remote" } });
    o = await call<MillerNoticeDto>(`${base}/notices/miller`, { as });
    expect(o.applies).toBe("not-covered");

    // Not federal any more: printing is refused.
    await call(base, {
      method: "PATCH",
      as,
      json: { publicOwner: "state_local", millerTier: null },
    });
    const state = await api(`${base}/notices/miller.pdf`, {
      method: "POST",
      as,
      json: { fields: FIELDS },
    });
    expect(state.status).toBe(400);

    // Another company sees nothing.
    const other = await setupTenant("owner");
    const crossed = base.replace(orgId, other.orgId);
    expect((await api(`${crossed}/notices/miller`, { as: other.userId })).status).toBe(404);
    expect((await api(`${base}/notices/miller`, { as: other.userId })).status).toBe(404);
  });
});
