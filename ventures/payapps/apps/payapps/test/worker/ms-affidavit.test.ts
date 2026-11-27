// Mississippi's 60 days and affidavit of nonpayment (Miss. Code Ann. §§ 85-7-419(5)(b), 85-7-433(3))
// through the HTTP API, on the same endpoints as Georgia's: a sent Mississippi waiver the payments do
// not cover shows its 60 days, the affidavit comes prefilled from the waiver (no unpaid-amount blank)
// and prints at Crew, the filing and its 2-day copy to the owner are recorded, no contractor's copy
// is ever asked, the (5)(c) affidavit of payment is recorded after payment, and another org sees none of it.
import type {
  GaAffidavitDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  WaiverDto,
  WaiverOverviewDto,
} from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant } from "./helpers";

const MS_FIELDS = {
  county: "Hinds",
  customerName: "Magnolia Builders, Inc.",
  workDescription: "concrete labor and materials",
  projectName: "Jackson Warehouse",
  cityOrTown: "Jackson",
  propertyCounty: "Hinds",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St, Jackson, MS 39201",
  amountPaidCents: 4_500_000,
  throughDate: "2026-10-31",
  claimantName: "Pearl River Concrete LLC",
  signerName: "Pat Example",
  signerTitle: "President",
};

async function msJob() {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Jackson Warehouse",
      gcName: "Magnolia Builders, Inc.",
      originalContractSumCents: 10_000_000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as,
    expect: 201,
    json: { itemNumber: "1", description: "Slab", originalCents: 10_000_000 },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-10-01", periodTo: "2026-10-31", applicationDate: "2026-10-31" },
  });
  const appPath = `${base}/pay-apps/${app.id}`;
  await call(`${appPath}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: d.sovLines[0]?.id,
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${appPath}/submit`, { method: "POST", as });
  const waivers = `${appPath}/waivers`;
  const w = await call<WaiverDto>(waivers, {
    method: "POST",
    as,
    expect: 201,
    json: {
      state: "MS",
      kind: "conditional-progress",
      amountCents: 4_500_000,
      fields: MS_FIELDS,
    },
  });
  await call(`${waivers}/${w.id}`, { method: "PATCH", as, json: { status: "sent" } });
  const aff = `${waivers}/${w.id}/ga-affidavit`;
  return { orgId, as, appPath, waivers, waiverId: w.id, aff };
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("Mississippi affidavit of nonpayment", () => {
  it("shows the 60 days on a sent, unpaid Mississippi waiver and prints the affidavit from it", async () => {
    const t = await msJob();
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.items.find((x) => x.id === t.waiverId)?.gaClock).toMatchObject({
      state: "MS",
      signedOn: today(),
      endsOn: plusDays(60),
      daysLeft: 60,
      unpaidCents: 4_500_000,
    });
    const a = await call<GaAffidavitDto>(t.aff, { as: t.as });
    expect(a.form.id).toBe("MS/affidavit-of-nonpayment/statutory");
    expect(a.form.citation).toBe("Miss. Code Ann. § 85-7-433(3)");
    expect(a.prefill).toMatchObject({
      county: "Hinds",
      customerName: "Magnolia Builders, Inc.",
      claimantName: "Pearl River Concrete LLC",
      signerName: "Pat Example",
      waiverDate: today(),
      waiverAmountCents: 4_500_000,
    });
    // Mississippi's form has no unpaid-amount blank, and the waiver's own sum is not carried.
    expect(a.prefill).not.toHaveProperty("unpaidCents");
    expect(a.prefill).not.toHaveProperty("amountPaidCents");
    expect(a.prefill).not.toHaveProperty("throughDate");

    const pdf = await api(`${t.aff}.pdf`, {
      method: "POST",
      as: t.as,
      json: { fields: a.prefill },
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toMatch(/affidavit-of-nonpayment-MS-/);
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const missing = await api(`${t.aff}.pdf`, {
      method: "POST",
      as: t.as,
      json: { fields: { ...a.prefill, waiverDate: "" } },
    });
    expect(missing.status).toBe(400);

    const cash = await call<{ projects: { actions: string[] }[] }>(
      `/api/orgs/${t.orgId}/reports/cash`,
      { as: t.as },
    );
    // 60 days out: not yet inside the 30-day reminder window.
    expect(cash.projects[0]?.actions.join(" ")).not.toMatch(/Mississippi: the lien waiver/);
  });

  it("records the filing and the 2-day copy, never asks a contractor's copy, then (5)(c) after payment", async () => {
    const t = await msJob();
    const put = (path: string, json: object, as = t.as) =>
      api(`${t.aff}/${path}`, { method: "PUT", as, json });
    let w = await call<WaiverDto>(`${t.aff}/filing`, {
      method: "PUT",
      as: t.as,
      json: { filedOn: today(), county: "Hinds County", recording: "Book 12, page 3" },
    });
    expect(w.gaClock).toMatchObject({ state: "MS", stage: "filed" });
    expect(w.gaClock?.filing).toMatchObject({ county: "Hinds", copyDueOn: plusDays(2) });
    let cash = await call<{ projects: { actions: string[] }[] }>(
      `/api/orgs/${t.orgId}/reports/cash`,
      { as: t.as },
    );
    const named = cash.projects[0]?.actions.join(" ") ?? "";
    expect(named).toMatch(/Mississippi: the affidavit of nonpayment .* Hinds County/);
    expect(named).not.toMatch(/contractor|notice of commencement/);

    // No contractor's copy in Mississippi.
    expect((await put("contractor-copy", { copy: "owed" })).status).toBe(400);
    expect((await api(`${t.aff}/contractor-copy`, { method: "DELETE", as: t.as })).status).toBe(
      400,
    );

    w = await call<WaiverDto>(`${t.aff}/filing`, {
      method: "PUT",
      as: t.as,
      json: {
        filedOn: today(),
        county: "Hinds",
        copySentOn: today(),
        copyMethod: "certified-mail",
      },
    });
    expect(w.gaAffidavitFiling?.copySentOn).toBe(today());
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    // Owner's copy sent: suspended, and nothing left to do in the cash report.
    expect(cash.projects[0]?.actions.join(" ")).not.toMatch(/affidavit/);

    // (5)(c) only after payment in full.
    expect((await put("paid-affidavit", { signedOn: today() })).status).toBe(400);
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_500_000, receivedOn: today() },
    });
    w = await call<WaiverDto>(`${t.aff}/paid-affidavit`, {
      method: "PUT",
      as: t.as,
      json: { signedOn: today(), recordedOn: today(), recording: "Book 12, page 9" },
    });
    expect(w.gaClock?.stage).toBe("released");

    const history = await call<{ items: { action: string; text: string }[] }>(
      `${t.appPath}/history`,
      { as: t.as },
    );
    const filed = history.items.find((e) => e.action === "ga_affidavit_filed");
    expect(filed?.text).toMatch(/^Mississippi affidavit of nonpayment/);
    expect(history.items.map((e) => e.text).join(" ")).not.toMatch(/Georgia/);

    const other = await setupTenant("owner");
    expect([403, 404]).toContain((await api(t.aff, { as: other.userId })).status);
    expect([403, 404]).toContain(
      (await put("filing", { filedOn: today(), county: "Hinds" }, other.userId)).status,
    );
  });
});
