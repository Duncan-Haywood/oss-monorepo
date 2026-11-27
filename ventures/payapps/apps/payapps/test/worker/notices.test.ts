// Preliminary notices of right to lien through the HTTP API: the plan gate, Wyoming's
// § 29-10-101(a) notice prefilled from the job and printed with the blank waiver it says is
// attached, California's §§ 8102/8202 notice prefilled from the job (estimate = contract sum with
// approved change orders), Florida's § 713.06(2)(c) Notice to Owner prefilled with the contractor
// as the first copy, Texas' two notices of claim (§§ 53.056, 53.057) prefilled with the original
// contractor, field errors, states with no notice, and tenant isolation.

import type { NoticeOverviewDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Jackson Clinic Addition",
      location: "455 W Broadway, Jackson WY",
      gcName: "Teton Builders",
      ownerName: "Valley Health District",
      originalContractSumCents: 10_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
});

const FIELDS = {
  claimantContact: "Cowboy State Electric LLC\n120 Elk Ave, Jackson WY\n(307) 555-0142, Dana Ruiz",
  workDescription: "Electrical rough-in and finish",
  propertyDescription: "Jackson Clinic Addition",
  propertyAddress: "455 W Broadway, Jackson WY",
  signedDate: "2026-11-25",
};

const print = (json: unknown, user = as, path = base) =>
  api(`${path}/notices/notice.pdf`, { method: "POST", as: user, json });

describe("preliminary notices", () => {
  it("on Free: the overview loads, printing needs Crew (402)", async () => {
    const o = await call<NoticeOverviewDto>(`${base}/notices?state=WY`, { as });
    expect(o.enabled).toBe(false);
    expect(o.states).toEqual(["CA", "FL", "TX", "WY"]);
    const res = await print({
      state: "WY",
      formId: "WY/preliminary-notice/statutory",
      fields: FIELDS,
    });
    expect(res.status).toBe(402);
  });

  it("Wyoming: prefilled from the job and the company, printed with the blank waiver", async () => {
    await grantPlan(orgId, "crew", "active");
    const o = await call<NoticeOverviewDto>(`${base}/notices?state=wy`, { as });
    expect(o.enabled).toBe(true);
    expect(o.state).toBe("WY");
    expect(o.ownerName).toBe("Valley Health District");
    const n = o.notices[0];
    expect(n?.citation).toBe("Wyo. Stat. § 29-10-101(a)");
    expect(n?.sendTo).toMatch(/record owner/);
    expect(o.prefill).toMatchObject({
      propertyDescription: "Jackson Clinic Addition",
      propertyAddress: "455 W Broadway, Jackson WY",
    });
    expect(o.prefill.claimantContact).toBeTruthy();
    expect(o.prefill).not.toHaveProperty("workDescription");

    const res = await print({ state: "WY", formId: n?.id, fields: FIELDS });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("preliminary-notice-WY.pdf");
    const body = await res.text();
    expect(body.startsWith("%PDF-")).toBe(true);
    expect(body).toContain("NOTICE TO OWNER");
    expect(body).toContain("Electrical rough-in and finish");
    // The attached § 29-10-101(b) form, on its own page.
    expect(body).toContain("LIEN WAIVER");
    expect(body).toContain("Notarial officer");
    expect(body).not.toContain("SAMPLE DATA");
  });

  it("refuses a missing required value, a wrong form id and an unknown state", async () => {
    const missing = await print({
      state: "WY",
      formId: "WY/preliminary-notice/statutory",
      fields: { ...FIELDS, workDescription: "" },
    });
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("Materials provided or work performed is required");
    const wrong = await print({
      state: "CA",
      formId: "WY/preliminary-notice/statutory",
      fields: FIELDS,
    });
    expect(wrong.status).toBe(400);
    expect((await api(`${base}/notices?state=ZZ`, { as })).status).toBe(400);
  });

  it("California: the §§ 8102/8202 items prefilled from the job, printed with the boldface statement", async () => {
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
    const caBase = `/api/orgs/${orgId}/projects/${p.id}`;
    let job = await call<ProjectDetailDto>(`${caBase}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 18_000_000 }] },
    });
    const addCo = async (number: string, amountCents: number) => {
      job = await call<ProjectDetailDto>(`${caBase}/change-orders`, {
        method: "POST",
        as,
        expect: 201,
        json: {
          number,
          description: `CO ${number}`,
          items: [{ sovLineId: job.sovLines[0]?.id, amountCents }],
        },
      });
      return job.changeOrders.find((c) => c.number === number)?.id;
    };
    const approved = await addCo("1", 450_000);
    await addCo("2", 999_900); // pending: not in the estimate
    await call(`${caBase}/change-orders/${approved}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-11-01" },
    });

    const o = await call<NoticeOverviewDto>(`${caBase}/notices?state=CA`, { as });
    const n = o.notices[0];
    expect(n?.id).toBe("CA/preliminary-notice/private-works");
    expect(n?.citation).toBe("Cal. Civ. Code §§ 8102, 8202");
    expect(n?.sendTo).toMatch(/owner or reputed owner.*direct contractor.*construction lender/);
    expect(o.prefill).toMatchObject({
      ownerNameAddress: "Valley Medical Partners LLC",
      directContractor: "Sierra Builders Inc.\n500 Van Ness Ave, Fresno CA 93721",
      hiredBy: "Sierra Builders Inc.",
      siteDescription: "Valley Clinic TI, 2100 Tulare St, Fresno CA 93721",
      estimate: "$184,500.00",
    });
    expect(o.prefill.claimant).toBeTruthy();

    const fields = Object.fromEntries(
      (n?.fields ?? []).map((f) => [f.key, o.prefill[f.key] ?? ""]).filter(([, v]) => v),
    );
    const res = await print(
      {
        state: "CA",
        formId: n?.id,
        fields: { ...fields, workDescription: "Electrical, labor and materials" },
      },
      as,
      caBase,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("preliminary-notice-CA.pdf");
    const body = await res.text();
    expect(body).toContain("PRELIMINARY NOTICE");
    expect(body).toContain("NOTICE TO PROPERTY OWNER");
    expect(body).toContain("EVEN THOUGH YOU HAVE PAID YOUR CONTRACTOR IN FULL");
    expect(body).toContain("$184,500.00");
    expect(body).not.toContain("construction lender, if any:");

    const missing = await print(
      { state: "CA", formId: n?.id, fields: { ...fields, workDescription: "" } },
      as,
      caBase,
    );
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("General description of the work is required");
  });

  it("Florida: the § 713.06(2)(c) Notice to Owner, the contractor prefilled as the first copy", async () => {
    const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Bayshore Dental",
        location: "410 S Howard Ave, Tampa FL 33606",
        gcName: "Gulf Coast Builders Inc.",
        gcAddress: "1 Harbour Pl, Tampa FL 33602",
        ownerName: "Bayshore Dental Holdings LLC",
        originalContractSumCents: 9_000_000,
      },
    });
    const flBase = `/api/orgs/${orgId}/projects/${p.id}`;
    const o = await call<NoticeOverviewDto>(`${flBase}/notices?state=fl`, { as });
    const n = o.notices[0];
    expect(n?.id).toBe("FL/notice-to-owner/statutory");
    expect(n?.citation).toBe("Fla. Stat. § 713.06(2)");
    expect(n?.notes.join(" ")).toMatch(/45 days/);
    expect(o.ca).toBeNull();
    expect(o.prefill).toMatchObject({
      ownerNameAddress: "Bayshore Dental Holdings LLC",
      hiredBy: "Gulf Coast Builders Inc.",
      siteDescription: "Bayshore Dental, 410 S Howard Ave, Tampa FL 33606",
      copiesTo: "Gulf Coast Builders Inc.\n1 Harbour Pl, Tampa FL 33602",
    });
    expect(o.prefill.lienorName).toBeTruthy();

    const fields = Object.fromEntries(
      (n?.fields ?? []).map((f) => [f.key, o.prefill[f.key] ?? ""]).filter(([, v]) => v),
    );
    const missing = await print({ state: "FL", formId: n?.id, fields }, as, flBase);
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain(
      "General description of services or materials is required",
    );

    const res = await print(
      {
        state: "FL",
        formId: n?.id,
        fields: {
          ...fields,
          workDescription: "Electrical, labor and materials",
          lienorAddress: "77 N Franklin St, Tampa FL 33602",
        },
      },
      as,
      flBase,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("preliminary-notice-FL.pdf");
    const body = await res.text();
    expect(body).toContain("NOTICE TO OWNER");
    expect(body).toContain("TO AVOID A LIEN AND PAYING TWICE");
    expect(body).toContain("Gulf Coast Builders Inc.");
    expect(body).toContain("1 Harbour Pl");
  });

  it("Texas: both notices of claim, prefilled, printed word for word", async () => {
    const o = await call<NoticeOverviewDto>(`${base}/notices?state=tx`, { as });
    expect(o.state).toBe("TX");
    expect(o.notices.map((n) => n.citation)).toEqual([
      "Tex. Prop. Code § 53.056",
      "Tex. Prop. Code § 53.057",
    ]);
    expect(o.notices[0]?.sendTo).toBe("the owner or reputed owner and the original contractor");
    expect(o.prefill).toMatchObject({
      originalContractor: "Teton Builders",
      projectDescription: "Jackson Clinic Addition, 455 W Broadway, Jackson WY",
    });
    expect(o.prefill.claimantName).toBeTruthy();
    expect(o.prefill.noticeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.prefill).not.toHaveProperty("claimAmount");
    expect(o.ca).toBeNull();
    expect(o.fl).toBeNull();

    const fields = {
      noticeDate: "2026-06-10",
      projectDescription: "Lamar Office Shell, 1200 S Lamar Blvd, Austin, TX 78704",
      claimantName: "Hill Country Electric LLC",
      workType: "Electrical labor and materials",
      originalContractor: "Capitol Builders Inc.",
      contactPerson: "Dana Ruiz",
      claimantAddress: "88 E 5th St, Austin, TX 78701",
    };
    const labor = await print({
      state: "TX",
      formId: o.notices[0]?.id,
      fields: { ...fields, claimAmount: "$18,400.00" },
    });
    expect(labor.status).toBe(200);
    expect(labor.headers.get("Content-Disposition")).toContain("preliminary-notice-TX.pdf");
    const text = await labor.text();
    expect(text).toContain("NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS");
    expect(text).toContain("Capitol Builders Inc.");
    expect(text).toContain("18,400.00");

    const ret = await print({
      state: "TX",
      formId: o.notices[1]?.id,
      fields: { ...fields, retainageUnpaid: "$9,250.00" },
    });
    expect(ret.status).toBe(200);
    expect(await ret.text()).toContain("NOTICE OF CLAIM FOR UNPAID RETAINAGE");

    // The retainage form's amount is its own field: the labor form's key does not fill it.
    const wrong = await print({
      state: "TX",
      formId: o.notices[1]?.id,
      fields: { ...fields, claimAmount: "$9,250.00" },
    });
    expect(wrong.status).toBe(400);
  });

  it("a state with no encoded notice lists none", async () => {
    const o = await call<NoticeOverviewDto>(`${base}/notices?state=CO`, { as });
    expect(o.notices).toEqual([]);
  });

  it("viewers can print (nothing is saved); another org sees 404", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const ok = await print(
      { state: "WY", formId: "WY/preliminary-notice/statutory", fields: FIELDS },
      viewer.id,
    );
    expect(ok.status).toBe(200);

    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const crossed = base.replace(orgId, other.orgId);
    expect((await api(`${crossed}/notices?state=WY`, { as: other.userId })).status).toBe(404);
    const res = await print(
      { state: "WY", formId: "WY/preliminary-notice/statutory", fields: FIELDS },
      other.userId,
      crossed,
    );
    expect(res.status).toBe(404);
    expect((await api(`${base}/notices`, { as: other.userId })).status).toBe(404);
  });
});
