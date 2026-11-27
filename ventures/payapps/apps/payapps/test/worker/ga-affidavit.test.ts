// Georgia's 90 days and the affidavit of nonpayment (O.C.G.A. § 44-14-366(g)(2)) through the HTTP
// API: a sent Georgia waiver the payments do not cover shows its 90 days on the pay-app's waiver
// list, the affidavit comes prefilled from the waiver, prints at Crew, refuses a zero unpaid
// amount, is Georgia's only, and is invisible to another org.
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

const GA_FIELDS = {
  county: "Fulton",
  customerName: "Peachtree Builders, Inc.",
  workDescription: "electrical labor and materials",
  projectName: "Midtown Clinic Addition",
  cityOrTown: "Atlanta",
  propertyCounty: "Fulton",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St NE, Atlanta, GA 30309",
  amountPaidCents: 4_500_000,
  claimantName: "Red Clay Electric LLC",
  throughDate: "2026-10-31",
};

async function gaJob() {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Midtown Clinic Addition",
      gcName: "Peachtree Builders, Inc.",
      originalContractSumCents: 10_000_000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as,
    expect: 201,
    json: { itemNumber: "1", description: "Electrical", originalCents: 10_000_000 },
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
      state: "GA",
      kind: "conditional-progress",
      amountCents: 4_500_000,
      fields: GA_FIELDS,
    },
  });
  await call(`${waivers}/${w.id}`, { method: "PATCH", as, json: { status: "sent" } });
  return { orgId, as, appPath, waivers, waiverId: w.id };
}

const today = () => new Date().toISOString().slice(0, 10);
const plus90 = () => new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

describe("Georgia affidavit of nonpayment", () => {
  it("shows the 90 days on a sent, unpaid Georgia waiver and prefills the affidavit from it", async () => {
    const t = await gaJob();
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    const w = o.items.find((x) => x.id === t.waiverId);
    expect(w?.gaClock).toMatchObject({
      signedOn: today(),
      endsOn: plus90(),
      daysLeft: 90,
      unpaidCents: 4_500_000,
      waiverAmountCents: 4_500_000,
    });
    const a = await call<GaAffidavitDto>(`${t.waivers}/${t.waiverId}/ga-affidavit`, { as: t.as });
    expect(a.form.citation).toBe("O.C.G.A. § 44-14-366(g)(2)");
    expect(a.prefill).toMatchObject({
      county: "Fulton",
      customerName: "Peachtree Builders, Inc.",
      propertyCounty: "Fulton",
      claimantName: "Red Clay Electric LLC",
      waiverDate: today(),
      waiverAmountCents: 4_500_000,
      unpaidCents: 4_500_000,
    });
    // Only the affidavit's own fields: the waiver's through date and amount blank are not carried.
    expect(a.prefill).not.toHaveProperty("throughDate");
    expect(a.prefill).not.toHaveProperty("amountPaidCents");

    const pdf = await api(`${t.waivers}/${t.waiverId}/ga-affidavit.pdf`, {
      method: "POST",
      as: t.as,
      json: { fields: a.prefill },
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const zero = await api(`${t.waivers}/${t.waiverId}/ga-affidavit.pdf`, {
      method: "POST",
      as: t.as,
      json: { fields: { ...a.prefill, unpaidCents: 0 } },
    });
    expect(zero.status).toBe(400);
  });

  it("a payment that covers the waiver stops the clock; a part payment lowers the unpaid amount", async () => {
    const t = await gaJob();
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_500_000, receivedOn: today() },
    });
    let o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.items.find((x) => x.id === t.waiverId)?.gaClock?.unpaidCents).toBe(3_000_000);
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 3_000_000, receivedOn: today() },
    });
    o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.items.find((x) => x.id === t.waiverId)?.gaClock).toBeNull();
  });

  it("is Georgia's only, needs Crew to print, and another org cannot see it", async () => {
    const t = await gaJob();
    const az = await call<WaiverDto>(t.waivers, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { state: "AZ", kind: "conditional-progress", amountCents: 4_500_000 },
    });
    const notGa = await api(`${t.waivers}/${az.id}/ga-affidavit`, { as: t.as });
    expect(notGa.status).toBe(400);

    const other = await setupTenant("owner");
    const cross = await api(`${t.waivers}/${t.waiverId}/ga-affidavit`, { as: other.userId });
    expect([403, 404]).toContain(cross.status);
    const crossPdf = await api(`${t.waivers}/${t.waiverId}/ga-affidavit.pdf`, {
      method: "POST",
      as: other.userId,
      json: { fields: {} },
    });
    expect([403, 404]).toContain(crossPdf.status);

    await grantPlan(t.orgId, "free", "active");
    const a = await call<GaAffidavitDto>(`${t.waivers}/${t.waiverId}/ga-affidavit`, { as: t.as });
    const gated = await api(`${t.waivers}/${t.waiverId}/ga-affidavit.pdf`, {
      method: "POST",
      as: t.as,
      json: { fields: a.prefill },
    });
    expect(gated.status).toBe(402);
  });

  it("records the affidavit as filed, then its copy to the owner; checks dates, role and tenant", async () => {
    const t = await gaJob();
    const filing = `${t.waivers}/${t.waiverId}/ga-affidavit/filing`;
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const bad = async (json: object) =>
      (await api(filing, { method: "PUT", as: t.as, json })).status;
    expect(await bad({ filedOn: future, county: "Fulton" })).toBe(400);
    expect(await bad({ filedOn: today(), county: "" })).toBe(400);
    expect(await bad({ filedOn: today(), county: "Fulton", copySentOn: today() })).toBe(400);

    let w = await call<WaiverDto>(filing, {
      method: "PUT",
      as: t.as,
      json: { filedOn: today(), county: "Fulton County", recording: "Deed Book 123, Page 45" },
    });
    expect(w.gaAffidavitFiling).toEqual({
      filedOn: today(),
      county: "Fulton",
      recording: "Deed Book 123, Page 45",
      copySentOn: null,
      copyMethod: null,
      copyTracking: null,
      contractorCopy: null,
      contractorCopySentOn: null,
      contractorCopyMethod: null,
      contractorCopyTracking: null,
      paidAffidavitSignedOn: null,
      paidAffidavitRecordedOn: null,
      paidAffidavitRecording: null,
    });
    expect(w.gaClock).toMatchObject({ stage: "filed", filing: { copyDaysLeft: 7, late: false } });
    let cash = await call<{ projects: { actions: string[] }[] }>(
      `/api/orgs/${t.orgId}/reports/cash`,
      { as: t.as },
    );
    expect(cash.projects[0]?.actions.join(" ")).toMatch(/Send a copy .* in 7 days/);

    w = await call<WaiverDto>(filing, {
      method: "PUT",
      as: t.as,
      json: {
        filedOn: today(),
        county: "Fulton",
        recording: "Deed Book 123, Page 45",
        copySentOn: today(),
        copyMethod: "certified-mail",
        copyTracking: "9407 1000 0000 0000 0000 00",
      },
    });
    expect(w.gaAffidavitFiling).toMatchObject({
      copySentOn: today(),
      copyMethod: "certified-mail",
    });
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.items.find((x) => x.id === t.waiverId)?.gaAffidavitFiling?.county).toBe("Fulton");
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    // The contractor's copy is not answered yet: still named.
    expect(cash.projects[0]?.actions.join(" ")).toMatch(/record whether one is owed/);
    await call(`${t.waivers}/${t.waiverId}/ga-affidavit/contractor-copy`, {
      method: "PUT",
      as: t.as,
      json: { copy: "not-owed" },
    });
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(cash.projects[0]?.actions.join(" ")).not.toMatch(/affidavit/);

    const history = await call<{ items: { action: string; text: string }[] }>(
      `${t.appPath}/history`,
      { as: t.as },
    );
    const actions = history.items.map((e) => e.action);
    expect(actions).toContain("ga_affidavit_filed");
    expect(actions).toContain("ga_affidavit_copy_sent");

    const other = await setupTenant("owner");
    const cross = await api(filing, {
      method: "PUT",
      as: other.userId,
      json: { filedOn: today(), county: "Fulton" },
    });
    expect([403, 404]).toContain(cross.status);
    expect([403, 404]).toContain(
      (await api(filing, { method: "DELETE", as: other.userId })).status,
    );

    w = await call<WaiverDto>(filing, { method: "DELETE", as: t.as });
    expect(w.gaAffidavitFiling).toBeNull();
    expect(w.gaClock?.stage).toBe("running");
  });

  it("records the contractor's copy apart from the owner's, then the (g)(3) affidavit of payment", async () => {
    const t = await gaJob();
    const ga = `${t.waivers}/${t.waiverId}/ga-affidavit`;
    const put = (path: string, json: object, as = t.as) =>
      api(`${ga}/${path}`, { method: "PUT", as, json });
    // Nothing to record before the filing.
    expect((await put("contractor-copy", { copy: "owed" })).status).toBe(400);
    await call(`${ga}/filing`, {
      method: "PUT",
      as: t.as,
      json: {
        filedOn: today(),
        county: "Fulton",
        copySentOn: today(),
        copyMethod: "certified-mail",
      },
    });
    // Day and method go together; a copy not owed has no day; not in the future.
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect((await put("contractor-copy", { copy: "owed", sentOn: today() })).status).toBe(400);
    expect(
      (await put("contractor-copy", { copy: "not-owed", sentOn: today(), method: "other" })).status,
    ).toBe(400);
    expect(
      (await put("contractor-copy", { copy: "owed", sentOn: future, method: "other" })).status,
    ).toBe(400);

    let w = await call<WaiverDto>(`${ga}/contractor-copy`, {
      method: "PUT",
      as: t.as,
      json: { copy: "owed" },
    });
    expect(w.gaAffidavitFiling?.contractorCopy).toBe("owed");
    let cash = await call<{ projects: { actions: string[] }[] }>(
      `/api/orgs/${t.orgId}/reports/cash`,
      { as: t.as },
    );
    expect(cash.projects[0]?.actions.join(" ")).toMatch(
      /copy to the contractor at the address on the notice of commencement is not recorded as sent/,
    );
    w = await call<WaiverDto>(`${ga}/contractor-copy`, {
      method: "PUT",
      as: t.as,
      json: { copy: "owed", sentOn: today(), method: "certified-mail", tracking: "9407 2" },
    });
    expect(w.gaAffidavitFiling).toMatchObject({
      copySentOn: today(),
      contractorCopy: "owed",
      contractorCopySentOn: today(),
      contractorCopyMethod: "certified-mail",
      contractorCopyTracking: "9407 2",
    });
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(cash.projects[0]?.actions.join(" ")).not.toMatch(/affidavit/);

    // (g)(3) only once the payments cover the waiver.
    expect((await put("paid-affidavit", { signedOn: today() })).status).toBe(400);
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_500_000, receivedOn: today() },
    });
    expect(
      (await put("paid-affidavit", { signedOn: today(), recording: "Book 9, Page 1" })).status,
    ).toBe(400);
    w = await call<WaiverDto>(`${ga}/paid-affidavit`, {
      method: "PUT",
      as: t.as,
      json: { signedOn: today() },
    });
    expect(w.gaClock?.stage).toBe("paid-after-filing");
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(cash.projects[0]?.actions.join(" ")).toMatch(/Record it in Fulton County/);
    w = await call<WaiverDto>(`${ga}/paid-affidavit`, {
      method: "PUT",
      as: t.as,
      json: { signedOn: today(), recordedOn: today(), recording: "Book 9, Page 1" },
    });
    expect(w.gaClock?.stage).toBe("released");
    expect(w.gaAffidavitFiling).toMatchObject({
      paidAffidavitSignedOn: today(),
      paidAffidavitRecordedOn: today(),
      paidAffidavitRecording: "Book 9, Page 1",
    });
    cash = await call(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(cash.projects[0]?.actions.join(" ")).not.toMatch(/Georgia/);

    const history = await call<{ items: { action: string; text: string }[] }>(
      `${t.appPath}/history`,
      { as: t.as },
    );
    const actions = history.items.map((e) => e.action);
    expect(actions).toContain("ga_affidavit_contractor_copy");
    expect(actions).toContain("ga_paid_affidavit_signed");
    expect(actions).toContain("ga_paid_affidavit_recorded");

    // Another org cannot touch either record.
    const other = await setupTenant("owner");
    expect([403, 404]).toContain(
      (await put("contractor-copy", { copy: "not-owed" }, other.userId)).status,
    );
    expect([403, 404]).toContain(
      (await put("paid-affidavit", { signedOn: today() }, other.userId)).status,
    );
    expect([403, 404]).toContain(
      (await api(`${ga}/paid-affidavit`, { method: "DELETE", as: other.userId })).status,
    );

    // Clearing the (g)(3) record returns to paid-after-filing; clearing the filing clears all.
    w = await call<WaiverDto>(`${ga}/paid-affidavit`, { method: "DELETE", as: t.as });
    expect(w.gaClock?.stage).toBe("paid-after-filing");
    expect(w.gaAffidavitFiling?.paidAffidavitSignedOn).toBeNull();
    w = await call<WaiverDto>(`${ga}/contractor-copy`, { method: "DELETE", as: t.as });
    expect(w.gaAffidavitFiling?.contractorCopy).toBeNull();
    await call(`${ga}/contractor-copy`, { method: "PUT", as: t.as, json: { copy: "not-owed" } });
    await call(`${ga}/filing`, { method: "DELETE", as: t.as });
    await call(`${ga}/filing`, {
      method: "PUT",
      as: t.as,
      json: { filedOn: today(), county: "Fulton" },
    });
    const again = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(
      again.items.find((x) => x.id === t.waiverId)?.gaAffidavitFiling?.contractorCopy,
    ).toBeNull();
  });

  it("needs a sent Georgia waiver, and Crew to record", async () => {
    const t = await gaJob();
    await call(`${t.waivers}/${t.waiverId}`, {
      method: "PATCH",
      as: t.as,
      json: { status: "draft" },
    });
    const filing = `${t.waivers}/${t.waiverId}/ga-affidavit/filing`;
    const draft = await api(filing, {
      method: "PUT",
      as: t.as,
      json: { filedOn: today(), county: "Fulton" },
    });
    expect(draft.status).toBe(400);
    await call(`${t.waivers}/${t.waiverId}`, {
      method: "PATCH",
      as: t.as,
      json: { status: "sent" },
    });
    await grantPlan(t.orgId, "free", "active");
    const gated = await api(filing, {
      method: "PUT",
      as: t.as,
      json: { filedOn: today(), county: "Fulton" },
    });
    expect(gated.status).toBe(402);
  });
  it("keeps the job's notice of commencement and hands it to the waiver list; another org cannot set it", async () => {
    const t = await gaJob();
    const job = t.appPath.replace(/\/pay-apps\/[^/]+$/, "");
    const overview = () => call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect((await overview()).gaNoc).toEqual({ filed: null, contractor: null });

    const saved = await call<ProjectDetailDto>(job, {
      method: "PATCH",
      as: t.as,
      json: {
        gaNocFiled: true,
        gaNocContractor: "Peachtree Builders, Inc., 1 Example Pkwy, Atlanta, GA 30303",
      },
    });
    expect(saved.gaNocFiled).toBe(true);
    expect((await overview()).gaNoc).toEqual({
      filed: true,
      contractor: "Peachtree Builders, Inc., 1 Example Pkwy, Atlanta, GA 30303",
    });

    // Another field's PATCH leaves it alone; "no notice" and "not known" are answers too.
    await call(job, { method: "PATCH", as: t.as, json: { billingDay: 25 } });
    expect((await overview()).gaNoc.filed).toBe(true);
    await call(job, {
      method: "PATCH",
      as: t.as,
      json: { gaNocFiled: false, gaNocContractor: null },
    });
    expect((await overview()).gaNoc).toEqual({ filed: false, contractor: null });
    await call(job, { method: "PATCH", as: t.as, json: { gaNocFiled: null } });
    expect((await overview()).gaNoc.filed).toBeNull();

    const tooLong = await api(job, {
      method: "PATCH",
      as: t.as,
      json: { gaNocContractor: "x".repeat(301) },
    });
    expect(tooLong.status).toBe(400);

    const history = await call<{ items: { text: string }[] }>(`${job}/history`, {
      as: t.as,
    });
    expect(history.items.some((e) => e.text.includes("Georgia notice of commencement filed"))).toBe(
      true,
    );

    const other = await setupTenant("owner");
    const foreign = await api(job.replace(t.orgId, other.orgId), {
      method: "PATCH",
      as: other.userId,
      json: { gaNocFiled: true },
    });
    expect(foreign.status).toBe(404);
    const theirs = await api(job, {
      method: "PATCH",
      as: other.userId,
      json: { gaNocFiled: true },
    });
    expect([403, 404]).toContain(theirs.status);
    expect((await overview()).gaNoc.filed).toBeNull();
  });
});
