// Lien waivers per pay application through the HTTP API: plan gate, Arizona, Florida, Michigan, Nevada, Texas and
// Utah statutory forms, Missouri's residential form and Massachusetts' § 32(4) partial waiver as alternatives, printed from packages/lien-waivers, Utah's missing unconditional form, tracked-only waivers where the statutory text is not encoded,
// tenant isolation, and California § 8132 exceptions prefilled from earlier unpaid conditional waivers.

import { listForms } from "@lien-waivers";
import type {
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  WaiverDto,
  WaiverOverviewDto,
} from "@shared/api/types";
import { suggestedFor } from "@worker/services/payapps/waivers";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let waivers: string;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      number: "24-117",
      location: "100 W Main St, Mesa AZ",
      gcName: "Copper State Builders",
      ownerName: "Desert Health LLC",
      originalContractSumCents: 10_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as,
    expect: 201,
    json: { itemNumber: "1", description: "Framing and drywall", originalCents: 10_000_000 },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-10-01", periodTo: "2026-10-31", applicationDate: "2026-10-31" },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
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
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  waivers = `${base}/pay-apps/${app.id}/waivers`;
});

const azFields = (o: Record<string, string | number>) => ({
  ...o,
  signerTitle: "President",
});

describe("lien waivers", () => {
  it("on Free: the overview loads but creating a waiver needs Crew (402)", async () => {
    const o = await call<WaiverOverviewDto>(waivers, { as });
    expect(o.enabled).toBe(false);
    expect(o.items).toEqual([]);
    const res = await api(waivers, {
      method: "POST",
      as,
      json: { state: "AZ", kind: "conditional-progress", amountCents: 1 },
    });
    expect(res.status).toBe(402);
  });

  it("Solo does not include waivers; Crew does", async () => {
    await grantPlan(orgId, "solo", "active");
    const solo = await api(waivers, {
      method: "POST",
      as,
      json: { state: "AZ", kind: "conditional-progress", amountCents: 1 },
    });
    expect(solo.status).toBe(402);
    await grantPlan(orgId, "crew", "active");
    expect((await call<WaiverOverviewDto>(waivers, { as })).enabled).toBe(true);
  });

  it("suggests a conditional progress waiver and prefills it from the job and pay app", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=az`, { as });
    expect(o.suggestedKind).toBe("conditional-progress");
    expect(o.state).toBe("AZ");
    expect(o.forms.map((f) => [f.kind, f.source, f.printable])).toEqual([
      ["conditional-progress", "statutory", true],
      ["unconditional-progress", "statutory", true],
      ["conditional-final", "statutory", true],
      ["unconditional-final", "statutory", true],
    ]);
    expect(o.forms[0]?.citation).toBe("Ariz. Rev. Stat. § 33-1008");
    // 10% retainage on $50,000 of work: $45,000 due.
    expect(o.prefill.checkAmountCents).toBe(4_500_000);
    expect(o.prefill.customerName).toBe("Copper State Builders");
    expect(o.prefill.ownerName).toBe("Desert Health LLC");
    expect(o.prefill.jobDescription).toBe("Mesa Clinic TI, 100 W Main St, Mesa AZ");
    expect(o.prefill.throughDate).toBe("2026-10-31");
  });

  let azId: string;
  it("creates an Arizona conditional waiver and prints the statutory wording", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=AZ`, { as });
    const form = o.forms.find((f) => f.kind === "conditional-progress");
    const fields = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: {
        state: "AZ",
        kind: "conditional-progress",
        amountCents: 4_500_000,
        throughDate: "2026-10-31",
        fields,
      },
    });
    azId = w.id;
    expect(w.printable).toBe(true);
    expect(w.formId).toBe("AZ/conditional-progress/statutory");
    expect(w.status).toBe("draft");

    const pdf = await api(`${waivers}/${w.id}/waiver.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("attachment");
    const body = await pdf.text();
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("Conditional waiver and release on progress payment");
    expect(body).toContain("$45,000.00");
    expect(body).toContain("Ariz. Rev. Stat. Sec. 33-1008");
  });

  it("rejects a printable waiver whose fields do not fill the statutory form", async () => {
    const res = await api(waivers, {
      method: "POST",
      as,
      json: {
        state: "AZ",
        kind: "unconditional-final",
        amountCents: 100,
        fields: { claimantName: "X", injected: "nope" },
      },
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: { code: string; details: { field: string }[] } };
    expect(err.error.code).toBe("invalid_waiver");
    expect(err.error.details.map((d) => d.field)).toContain("injected");
    expect(err.error.details.map((d) => d.field)).toContain("ownerName");
  });

  it("prints Nevada's statutory form with its own blanks filled from the pay app", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=NV`, { as });
    expect(o.forms.every((f) => f.source === "statutory" && f.printable)).toBe(true);
    expect(o.forms[0]?.citation).toBe("Nev. Rev. Stat. § 108.2457");
    expect(o.prefill).toMatchObject({
      invoiceNumber: "Pay Application No. 1",
      paymentAmountCents: 4_500_000,
      paymentPeriod: "2026-10-01 to 2026-10-31",
      projectName: "Mesa Clinic TI",
      jobLocation: "100 W Main St, Mesa AZ",
    });
    const form = o.forms.find((f) => f.kind === "unconditional-progress");
    const fields = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    // Nevada's forms have no through date and no check maker: the prefill offers them, the form
    // does not take them.
    expect(fields).not.toHaveProperty("throughDate");
    expect(fields).not.toHaveProperty("checkMaker");
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "NV", kind: "unconditional-progress", amountCents: 4_500_000, fields },
    });
    expect(w.formId).toBe("NV/unconditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT");
    expect(body).toContain("Pay Application No. 1");
    expect(body).toContain("$45,000.00");
    expect(body).toContain("Undersigned's Customer"); // curly apostrophe set as ASCII
    expect(body).toContain("Nev. Rev. Stat. Sec. 108.2457");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
  });

  it("prints Michigan's partial conditional waiver; the signer circles does or does not", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=MI`, { as });
    expect(o.forms.every((f) => f.source === "statutory" && f.printable)).toBe(true);
    expect(o.forms[0]?.citation).toBe("Mich. Comp. Laws § 570.1115");
    const form = o.forms.find((f) => f.kind === "conditional-progress");
    const fields = {
      ...Object.fromEntries(
        Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
      ),
      workProvided: "drywall labor and materials",
    };
    // Michigan's forms have no check maker or owner blank: the prefill offers them, the form
    // does not take them.
    expect(fields).not.toHaveProperty("checkMaker");
    expect(fields).toHaveProperty("throughDate", "2026-10-31");
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "MI", kind: "conditional-progress", amountCents: 4_500_000, fields },
    });
    expect(w.formId).toBe("MI/conditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("PARTIAL CONDITIONAL WAIVER");
    expect(body).toContain("drywall labor and materials");
    expect(body).toContain("$45,000.00");
    expect(body).toContain("Mich. Comp. Laws Sec. 570.1115");
    expect(body).toContain("DO NOT SIGN BLANK OR INCOMPLETE FORMS");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
  });

  it("prints Texas's statutory form; the unconditional notice comes first", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=TX`, { as });
    expect(o.forms.every((f) => f.source === "statutory" && f.printable)).toBe(true);
    expect(o.forms[0]?.citation).toBe("Tex. Prop. Code § 53.284");
    const form = o.forms.find((f) => f.kind === "unconditional-progress");
    const fields = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    expect(fields).not.toHaveProperty("throughDate"); // Texas's forms have no through date
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "TX", kind: "unconditional-progress", amountCents: 4_500_000, fields },
    });
    expect(w.formId).toBe("TX/unconditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    const notice = body.indexOf("This document waives rights unconditionally");
    const title = body.indexOf("UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT");
    expect(notice).toBeGreaterThan(0);
    expect(title).toBeGreaterThan(notice);
    expect(body).toContain("$45,000.00");
    expect(body).toContain("Tex. Prop. Code Sec. 53.284");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
  });

  it("prints Utah's two forms; an unconditional Utah waiver is tracked with the reason", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=UT`, { as });
    expect(o.forms.map((f) => [f.kind, f.printable])).toEqual([
      ["conditional-progress", true],
      ["unconditional-progress", false],
      ["conditional-final", true],
      ["unconditional-final", false],
    ]);
    expect(o.forms[1]?.notes[0]).toMatch(/no unconditional waiver form/);
    const form = o.forms.find((f) => f.kind === "conditional-progress");
    const fields = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "UT", kind: "conditional-progress", amountCents: 4_500_000, fields },
    });
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT");
    expect(body).toContain("Payment Period");
    expect(body).toContain("Utah Code Sec. 38-1a-802");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });

    const tracked = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "UT", kind: "unconditional-final", amountCents: 4_500_000, fields: {} },
    });
    expect(tracked.printable).toBe(false);
    const pdf = await api(`${waivers}/${tracked.id}/waiver.pdf`, { as });
    expect(pdf.status).toBe(400);
    const err = (await pdf.json()) as { error: { message: string } };
    expect(err.error.message).toMatch(/no unconditional waiver form/);
    await call(`${waivers}/${tracked.id}`, { method: "DELETE", as });
  });

  it("prints Florida's two forms; a conditional Florida waiver is tracked with the reason", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=FL`, { as });
    expect(o.forms.map((f) => [f.kind, f.printable])).toEqual([
      ["conditional-progress", false],
      ["unconditional-progress", true],
      ["conditional-final", false],
      ["unconditional-final", true],
    ]);
    expect(o.forms[0]?.notes[0]).toMatch(/no separate conditional waiver form/);
    const form = o.forms.find((f) => f.kind === "unconditional-progress");
    const fields: Record<string, string | number> = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    fields.ownerName ??= "Bayshore Medical Partners, LLC";
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "FL", kind: "unconditional-progress", amountCents: 4_500_000, fields },
    });
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("WAIVER AND RELEASE OF LIEN UPON PROGRESS PAYMENT");
    expect(body).toContain("does not cover any retention");
    expect(body).toContain("Fla. Stat. Sec. 713.20");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });

    const tracked = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "FL", kind: "conditional-progress", amountCents: 4_500_000, fields: {} },
    });
    expect(tracked.printable).toBe(false);
    const pdf = await api(`${waivers}/${tracked.id}/waiver.pdf`, { as });
    expect(pdf.status).toBe(400);
    const err = (await pdf.json()) as { error: { message: string } };
    expect(err.error.message).toMatch(/713\.20\(7\)/);
    await call(`${waivers}/${tracked.id}`, { method: "DELETE", as });
  });

  it("prints Wyoming's one form, retainage prefilled; a conditional Wyoming waiver is tracked", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=WY`, { as });
    expect(o.forms.map((f) => [f.kind, f.printable])).toEqual([
      ["conditional-progress", false],
      ["unconditional-progress", true],
      ["conditional-final", false],
      ["unconditional-final", true],
    ]);
    expect(o.forms[1]?.citation).toBe("Wyo. Stat. § 29-10-101(b)");
    // $50,000 of work at 10% retainage: $5,000 held as of this application.
    expect(o.prefill).toMatchObject({ retainageHeldCents: 500_000, amountPaidCents: 4_500_000 });
    expect(o.prefill).not.toHaveProperty("unpaidCents");
    const form = o.forms.find((f) => f.kind === "unconditional-progress");
    const fields: Record<string, string | number> = Object.fromEntries(
      Object.entries(azFields(o.prefill)).filter(([k]) => form?.fields.some((f) => f.key === k)),
    );
    fields.unpaidCents = 0;
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "WY", kind: "unconditional-progress", amountCents: 4_500_000, fields },
    });
    expect(w.formId).toBe("WY/unconditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("LIEN WAIVER");
    expect(body).toContain("Notarial officer");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });

    const tracked = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "WY", kind: "conditional-progress", amountCents: 4_500_000, fields: {} },
    });
    expect(tracked.printable).toBe(false);
    const pdf = await api(`${waivers}/${tracked.id}/waiver.pdf`, { as });
    expect(pdf.status).toBe(400);
    await call(`${waivers}/${tracked.id}`, { method: "DELETE", as });
  });

  it("before payment a Florida job keeps the conditional kind (never an unconditional form early)", () => {
    expect(suggestedFor("conditional-progress", listForms("FL"))).toBe("conditional-progress");
    expect(suggestedFor("unconditional-progress", listForms("FL"))).toBe("unconditional-progress");
  });

  it("after payment, a Utah job is offered its conditional form (no unconditional one exists)", () => {
    expect(suggestedFor("unconditional-progress", listForms("UT"))).toBe("conditional-progress");
    expect(suggestedFor("unconditional-final", listForms("UT"))).toBe("conditional-final");
    expect(suggestedFor("unconditional-final", listForms("TX"))).toBe("unconditional-final");
    expect(suggestedFor("unconditional-final", listForms("CA"))).toBe("unconditional-final");
  });

  it("Georgia prints its statutory interim and final forms (O.C.G.A. § 44-14-366(d), (e))", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=GA`, { as });
    expect(o.forms.map((f) => [f.kind, f.source, f.printable, f.citation])).toEqual([
      ["conditional-progress", "statutory", true, "O.C.G.A. § 44-14-366(d)"],
      ["unconditional-progress", "statutory", true, "O.C.G.A. § 44-14-366(d)"],
      ["conditional-final", "statutory", true, "O.C.G.A. § 44-14-366(e)"],
      ["unconditional-final", "statutory", true, "O.C.G.A. § 44-14-366(e)"],
    ]);
  });

  it("Mississippi prints its statutory interim and final forms (Miss. Code Ann. § 85-7-433(1), (2)), prefilled from the pay app", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=MS`, { as });
    expect(o.forms.map((f) => [f.kind, f.source, f.printable, f.citation])).toEqual([
      ["conditional-progress", "statutory", true, "Miss. Code Ann. § 85-7-433(1)"],
      ["unconditional-progress", "statutory", true, "Miss. Code Ann. § 85-7-433(1)"],
      ["conditional-final", "statutory", true, "Miss. Code Ann. § 85-7-433(2)"],
      ["unconditional-final", "statutory", true, "Miss. Code Ann. § 85-7-433(2)"],
    ]);
    const form = o.forms.find((f) => f.kind === "conditional-progress");
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: {
        state: "MS",
        kind: "conditional-progress",
        amountCents: 4_500_000,
        fields: {
          ...Object.fromEntries(
            Object.entries(o.prefill).filter(([k]) => form?.fields.some((f) => f.key === k)),
          ),
          county: "Hinds",
          workDescription: "mechanical labor and materials",
          cityOrTown: "Jackson",
          propertyCounty: "Hinds",
          ownerName: "Example Holdings LLC",
          propertyDescription: "100 Example St, Jackson, MS 39216",
        },
      },
    });
    expect(w.printable).toBe(true);
    expect(w.formId).toBe("MS/conditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("INTERIM WAIVER AND RELEASE UPON PAYMENT");
    expect(body).toContain("NOTARY PUBLIC");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
  });

  it("California prints its statutory form (Civ. Code § 8132), prefilled from the pay app", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=CA`, { as });
    expect(o.forms.map((f) => [f.kind, f.source, f.printable])).toEqual([
      ["conditional-progress", "statutory", true],
      ["unconditional-progress", "statutory", true],
      ["conditional-final", "statutory", true],
      ["unconditional-final", "statutory", true],
    ]);
    const form = o.forms.find((f) => f.kind === "conditional-progress");
    expect(form?.citation).toBe("Cal. Civ. Code § 8132");
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: {
        state: "CA",
        kind: "conditional-progress",
        amountCents: 4_500_000,
        fields: {
          ...Object.fromEntries(
            Object.entries(o.prefill).filter(([k]) => form?.fields.some((f) => f.key === k)),
          ),
          checkAmountCents: 4_500_000,
          signerTitle: "President",
          priorWaiverDates: "2026-09-30",
          priorUnpaidAmounts: "12,500.00",
        },
      },
    });
    expect(w.printable).toBe(true);
    expect(w.formId).toBe("CA/conditional-progress/statutory");
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT");
    expect(body).toContain("STOP PAYMENT NOTICE");
    expect(body).toContain("45,000.00");
    expect(body).toContain("12,500.00");
    expect(body).toContain("Cal. Civ. Code Sec. 8132");
  });

  it("Missouri: the general forms, plus the residential unconditional final form on request", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=MO`, { as });
    expect(o.forms.every((f) => f.source === "generic" && f.printable)).toBe(true);
    expect(o.forms.some((f) => f.notes.some((n) => n.includes("§ 429.016.27")))).toBe(true);
    expect(o.alternatives.map((f) => [f.id, f.kind, f.source])).toEqual([
      ["MO/unconditional-final/statutory-residential", "unconditional-final", "statutory"],
    ]);
    const alt = o.alternatives[0];
    expect(alt?.appliesTo).toMatch(/owner-occupied/);
    expect(alt?.citation).toBe("Mo. Rev. Stat. § 429.016.27");
    const fields = {
      claimantName: "Show-Me Framing LLC",
      claimantAddress: "400 Example Rd, Springfield, MO 65802",
      legalDescription: "Lot 12, Block 3, Example Ridge Subdivision, Greene County, Missouri",
      signerName: "Dana Example",
      signerTitle: "Member",
      signerAddress: "400 Example Rd, Springfield, MO 65802",
      signerPhone: "417-555-0100",
      signedDate: "2026-11-25",
    };
    // The alternative form must be of the kind asked for.
    await call(waivers, {
      method: "POST",
      as,
      expect: 400,
      json: {
        state: "MO",
        kind: "unconditional-progress",
        formId: alt?.id,
        amountCents: 1,
        fields,
      },
    });
    // Another state cannot borrow it.
    await call(waivers, {
      method: "POST",
      as,
      expect: 400,
      json: { state: "KS", kind: "unconditional-final", formId: alt?.id, amountCents: 1, fields },
    });
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: {
        state: "MO",
        kind: "unconditional-final",
        formId: alt?.id,
        amountCents: 5_000_000,
        fields,
      },
    });
    expect(w.formId).toBe("MO/unconditional-final/statutory-residential");
    expect(w.printable).toBe(true);
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("UNCONDITIONAL FINAL LIEN WAIVER");
    expect(body).toContain("FOR RESIDENTIAL REAL PROPERTY");
    expect(body).toContain("Lot 12, Block 3");
    expect(body).toContain("Mo. Rev. Stat. Sec. 429.016.27");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
    // Without formId, Missouri's unconditional final waiver is the general form.
    const g = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: { state: "MO", kind: "unconditional-final", amountCents: 5_000_000 },
    });
    expect(g.formId).toBeNull(); // no fields sent: tracked only
    await call(`${waivers}/${g.id}`, { method: "DELETE", as });
  });

  it("Massachusetts: the general forms, plus the § 32(4) partial waiver with the G702's lines", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=MA`, { as });
    expect(o.forms.every((f) => f.source === "generic" && f.printable)).toBe(true);
    expect(o.forms.some((f) => f.notes.some((n) => n.includes("c. 254, § 32")))).toBe(true);
    expect(o.alternatives.map((f) => [f.id, f.kind, f.source])).toEqual([
      [
        "MA/conditional-progress/statutory-partial-subordination",
        "conditional-progress",
        "statutory",
      ],
    ]);
    const alt = o.alternatives[0];
    expect(alt?.appliesTo).toMatch(/notice of contract/);
    expect(alt?.citation).toBe("Mass. Gen. Laws c. 254, § 32(4)");
    // Lines 1-8 from this application's G702: $100,000 contract, $50,000 done, 10% held.
    expect(o.prefill).toMatchObject({
      applicationNumber: "1",
      originalContractCents: 10_000_000,
      approvedChangeOrders: "$0.00",
      adjustedContractCents: 10_000_000,
      completedToDateCents: 5_000_000,
      retainageCents: 500_000,
      totalPayableCents: 4_500_000,
      previousPaymentsCents: 0,
      currentAmountDueCents: 4_500_000,
      pendingChangeOrders: "$0.00",
      paymentAmountCents: 4_500_000,
      paymentAmountWords: "Forty-Five Thousand and 00/100 Dollars",
      invoiceDate: "2026-10-31",
      throughDate: "2026-10-31",
      propertyDescription: "Mesa Clinic TI, 100 W Main St, Mesa AZ",
    });
    const keys = new Set(alt?.fields.map((f) => f.key));
    const fields: Record<string, string | number> = Object.fromEntries(
      Object.entries(o.prefill).filter(([k]) => keys.has(k)),
    );
    // County and town are the user's to fill: without them the form is refused.
    await call(waivers, {
      method: "POST",
      as,
      expect: 400,
      json: { state: "MA", kind: "conditional-progress", formId: alt?.id, amountCents: 1, fields },
    });
    const w = await call<WaiverDto>(waivers, {
      method: "POST",
      as,
      expect: 201,
      json: {
        state: "MA",
        kind: "conditional-progress",
        formId: alt?.id,
        amountCents: 4_500_000,
        fields: {
          ...fields,
          county: "Middlesex",
          cityOrTown: "Cambridge",
          signerName: "Dana Example",
          signerTitle: "Manager",
        },
      },
    });
    expect(w.formId).toBe("MA/conditional-progress/statutory-partial-subordination");
    expect(w.printable).toBe(true);
    const body = await (await api(`${waivers}/${w.id}/waiver.pdf`, { as })).text();
    expect(body).toContain("Partial Waiver and Subordination of Lien");
    expect(body).toContain("Middlesex COUNTY");
    expect(body).toContain("Forty-Five Thousand and 00/100 Dollars");
    expect(body).toContain("Signed under the penalties of perjury");
    await call(`${waivers}/${w.id}`, { method: "DELETE", as });
  });

  it("a state without a statutory form prints the general form, marked as such", async () => {
    const o = await call<WaiverOverviewDto>(`${waivers}?state=OR`, { as });
    expect(o.forms.every((f) => f.source === "generic" && f.printable)).toBe(true);
    const bad = await api(`${waivers}?state=ZZ`, { as });
    expect(bad.status).toBe(400);
  });

  it("marks a waiver sent, lists it, and remembers the job's state", async () => {
    const sent = await call<WaiverDto>(`${waivers}/${azId}`, {
      method: "PATCH",
      as,
      json: { status: "sent" },
    });
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).not.toBeNull();
    const o = await call<WaiverOverviewDto>(waivers, { as });
    expect(o.items.length).toBe(2);
    // The last waiver created on this job was California's.
    expect(o.state).toBe("CA");
  });

  it("viewers can read but not create; another org sees 404", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await api(waivers, { as: viewer.id })).status).toBe(200);
    const res = await api(waivers, {
      method: "POST",
      as: viewer.id,
      json: { state: "AZ", kind: "conditional-progress", amountCents: 1 },
    });
    expect(res.status).toBe(403);

    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    // Org B using org A's ids under its own org path, and under org A's path.
    const crossed = waivers.replace(orgId, other.orgId);
    expect((await api(crossed, { as: other.userId })).status).toBe(404);
    expect((await api(`${crossed}/${azId}/waiver.pdf`, { as: other.userId })).status).toBe(404);
    expect((await api(waivers, { as: other.userId })).status).toBe(404);
  });

  it("after a downgrade the waivers stay readable and printable", async () => {
    await grantPlan(orgId, "crew", "canceled");
    const o = await call<WaiverOverviewDto>(waivers, { as });
    expect(o.enabled).toBe(false);
    expect(o.items.length).toBe(2);
    expect((await api(`${waivers}/${azId}/waiver.pdf`, { as })).status).toBe(200);
    const patch = await api(`${waivers}/${azId}`, {
      method: "PATCH",
      as,
      json: { status: "draft" },
    });
    expect(patch.status).toBe(402);
  });
});

describe("California § 8132: earlier conditional waivers still unpaid", () => {
  it("prefills the dates and unpaid amounts of this job's earlier sent, unpaid conditional waivers", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId, "crew", "active");
    const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: {
        name: "Fresno Library Reroof",
        location: "2420 Mariposa St, Fresno CA",
        gcName: "Valley Builders",
        originalContractSumCents: 10_000_000,
      },
    });
    const jobBase = `/api/orgs/${t.orgId}/projects/${p.id}`;
    const d = await call<ProjectDetailDto>(`${jobBase}/sov-lines`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { itemNumber: "1", description: "Roofing", originalCents: 10_000_000 },
    });
    const bill = async (periodFrom: string, periodTo: string, workCents: number) => {
      const app = await call<PayAppDetailDto>(`${jobBase}/pay-apps`, {
        method: "POST",
        as: t.userId,
        expect: 201,
        json: { periodFrom, periodTo, applicationDate: periodTo },
      });
      await call(`${jobBase}/pay-apps/${app.id}/lines`, {
        method: "PUT",
        as: t.userId,
        json: {
          lines: [
            {
              sovLineId: d.sovLines[0]?.id,
              workThisPeriodCents: workCents,
              storedMaterialsCents: 0,
              retainageReleasedCents: 0,
            },
          ],
        },
      });
      await call(`${jobBase}/pay-apps/${app.id}/submit`, { method: "POST", as: t.userId });
      return `${jobBase}/pay-apps/${app.id}`;
    };
    const giveConditional = async (appPath: string, amountCents: number, signedDate: string) => {
      const o = await call<WaiverOverviewDto>(`${appPath}/waivers?state=CA`, { as: t.userId });
      const form = o.forms.find((f) => f.kind === "conditional-progress");
      const w = await call<WaiverDto>(`${appPath}/waivers`, {
        method: "POST",
        as: t.userId,
        expect: 201,
        json: {
          state: "CA",
          kind: "conditional-progress",
          amountCents,
          fields: {
            ...Object.fromEntries(
              Object.entries(o.prefill).filter(([k]) => form?.fields.some((f) => f.key === k)),
            ),
            signerTitle: "President",
            signedDate,
          },
        },
      });
      await call(`${appPath}/waivers/${w.id}`, {
        method: "PATCH",
        as: t.userId,
        json: { status: "sent" },
      });
      return o;
    };

    // #1: $20,000 of work, 10% retainage, $18,000 due; conditional waiver given, still unpaid.
    const app1 = await bill("2026-09-01", "2026-09-30", 2_000_000);
    const first = await giveConditional(app1, 1_800_000, "2026-09-30");
    // Nothing earlier to except on the first application.
    expect(first.prefill.priorWaiverDates).toBeUndefined();
    expect(first.prefill.priorUnpaidAmounts).toBeUndefined();

    // #2: a draft conditional waiver (never given) does not count.
    const app2 = await bill("2026-10-01", "2026-10-31", 1_000_000);
    const o2 = await call<WaiverOverviewDto>(`${app2}/waivers?state=CA`, { as: t.userId });
    expect(o2.prefill.priorWaiverDates).toBe("September 30, 2026");
    expect(o2.prefill.priorUnpaidAmounts).toBe("$18,000.00");
    await giveConditional(app2, 900_000, "2026-10-31");

    // #3 lists both, oldest first; a partial payment on #1 leaves only the rest unpaid.
    const app3 = await bill("2026-11-01", "2026-11-30", 1_000_000);
    await call(`${app1}/payments`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { amountCents: 500_000, receivedOn: "2026-11-10", reference: "2201" },
    });
    let o3 = await call<WaiverOverviewDto>(`${app3}/waivers?state=CA`, { as: t.userId });
    expect(o3.prefill.priorWaiverDates).toBe("September 30, 2026; October 31, 2026");
    expect(o3.prefill.priorUnpaidAmounts).toBe("$13,000.00; $9,000.00");

    // Once #1 is paid it drops off; the printed § 8132 form carries what is left.
    await call(`${app1}/mark-paid`, {
      method: "POST",
      as: t.userId,
      json: { receivedOn: "2026-11-20" },
    });
    o3 = await call<WaiverOverviewDto>(`${app3}/waivers?state=CA`, { as: t.userId });
    expect(o3.prefill.priorWaiverDates).toBe("October 31, 2026");
    expect(o3.prefill.priorUnpaidAmounts).toBe("$9,000.00");
    const form = o3.forms.find((f) => f.kind === "conditional-progress");
    const w = await call<WaiverDto>(`${app3}/waivers`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: {
        state: "CA",
        kind: "conditional-progress",
        amountCents: 900_000,
        fields: {
          ...Object.fromEntries(
            Object.entries(o3.prefill).filter(([k]) => form?.fields.some((f) => f.key === k)),
          ),
          signerTitle: "President",
        },
      },
    });
    const body = await (await api(`${app3}/waivers/${w.id}/waiver.pdf`, { as: t.userId })).text();
    expect(body).toContain("October 31, 2026");
    expect(body).toContain("$9,000.00");

    // Another state's forms have no such blanks: a Texas overview of #3 sees none from California.
    const tx = await call<WaiverOverviewDto>(`${app3}/waivers?state=TX`, { as: t.userId });
    expect(tx.prefill.priorWaiverDates).toBeUndefined();
  });
});
