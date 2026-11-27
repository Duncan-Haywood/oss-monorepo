import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { makeFormPdf } from "@test/unit/form-fixture";
import { describe, expect, it } from "vitest";
import { certifiedPayrollSchema } from "./certified-payroll";
import {
  buildNjCpr,
  mw562FieldNames,
  mw562Problem,
  NJ_ROWS,
  njCprFileName,
  njDate,
  njFein,
  njNextWeek,
  njPlanKind,
} from "./nj-cpr";
import { MW562 } from "./nj-mw562-fields";
import { fillForm, readFormFields } from "./pdf/form-fill";

// A Newark electrical sub, the week ending Saturday 2026-08-01.
const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Newark School 14 Lighting",
    projectNumber: "NPS-2026-14",
    payrollNo: "3",
    businessName: "Garden State Electric LLC",
    businessAddress: "12 Market St, Newark NJ 07102",
    projectLocation: "Newark, Essex County, NJ",
    wageDeterminations: "NJ Essex County Electrician",
    weekEnding: "2026-08-01",
    workers: [
      {
        lastName: "Rivera",
        firstName: "Ana",
        middleInitial: "L",
        rows: [
          {
            classification: "Electrician",
            status: "J",
            st: [0, 800, 800, 800, 800, 800, 0],
            ot: [0, 200, 0, 0, 0, 0, 0],
            stRateCents: 6_050,
            otRateCents: 9_075,
          },
        ],
        taxCents: 40_000,
        ficaCents: 26_000,
        otherCents: 3_000,
        otherNote: "Union dues",
        fringeCreditsCents: [2_100, 1_500],
      },
      {
        lastName: "Chen",
        firstName: "Wei",
        rows: [
          {
            classification: "Electrician",
            status: "RA",
            apprenticeLevel: "2nd year",
            st: [0, 800, 800, 800, 800, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 3_000,
            otRateCents: 4_500,
            cashInLieuHourlyCents: 200,
          },
        ],
        taxCents: 9_000,
        ficaCents: 7_500,
        fringeCreditsCents: [2_100, 0],
      },
    ],
    apprenticeships: [{ program: "IBEW Local 102 JATC", registeredWith: "OA" }],
    fringePlans: [
      { name: "IBEW Local 102 Health Fund", type: "Health and welfare", planNo: "22-1234567" },
      { name: "IBEW Local 102 Pension", type: "Pension" },
    ],
    certifierName: "Pat Owner",
    certifierTitle: "President",
    ...over,
  });

const job = {
  fein: "221234567",
  registration: "PW-123456",
  wagesPaid: "2026-08-07",
};
const workers = [
  {
    address: "4 Elm St, Newark NJ",
    sex: "F" as const,
    race: "W" as const,
    ethnicity: "H" as const,
    stateTaxCents: 9_000,
  },
  {
    address: "9 Oak Ave, Kearny NJ",
    sex: "M" as const,
    race: "A" as const,
    ethnicity: "N" as const,
    stateTaxCents: 2_000,
  },
];
const R = MW562.rows;

describe("buildNjCpr", () => {
  it("fills the MW-562 from the WH-347 week and the New Jersey extras", () => {
    const r = buildNjCpr(payroll(), job, workers, "2026-08-07");
    expect(r.issues.filter((i) => i.level === "error").map((i) => i.message)).toEqual([]);
    const v = r.values as Record<string, string | boolean>;
    expect(v[MW562.header.contractorName]).toBe("Garden State Electric LLC");
    expect(v[MW562.header.fein]).toBe("22-1234567");
    expect(v[MW562.header.projectId]).toBe("NPS-2026-14");
    expect(v[MW562.header.weekEnding]).toBe("08/01/2026");
    expect(v[MW562.header.wagesPaid]).toBe("08/07/2026");
    expect(v[MW562.dates.su]).toBe("7/26");
    expect(v[MW562.dates.sa]).toBe("8/1");
    expect(v[MW562.boxes.subcontractor]).toBe(true);
    expect(v[MW562.boxes.contractor]).toBe(false);
    // Row 1: Rivera, 40 straight + 2 overtime hours.
    expect(v[R[0].employee]).toBe("Rivera, Ana L, 4 Elm St, Newark NJ");
    expect(v[R[0].jobTitle]).toBe("Journeyman");
    expect(v[R[0].sex]).toBe("F");
    expect(v[R[0].st.mo]).toBe("8");
    expect(v[R[0].st.su]).toBe("");
    expect(v[R[0].st.total]).toBe("40");
    expect(v[R[0].st.rate]).toBe("60.50");
    expect(v[R[0].ot.mo]).toBe("2");
    expect(v[R[0].ot.total]).toBe("2");
    expect(v[R[0].ot.rate]).toBe("90.75");
    // 40 x 60.50 + 2 x 90.75 = 2,601.50; deductions 260 + 310 federal + 90 state + 30 = 690.
    expect(v[R[0].grossProject]).toBe("2601.50");
    expect(v[R[0].grossWeek]).toBe("2601.50");
    expect(v[R[0].federalTax]).toBe("310.00");
    expect(v[R[0].stateTax]).toBe("90.00");
    expect(v[R[0].other1]).toBe("30.00");
    expect(v[R[0].totalDeductions]).toBe("690.00");
    expect(v[R[0].net]).toBe("1911.50");
    expect(v[R[0].fringe]).toBe("36.00");
    expect(v[MW562.header.otherLabel1]).toBe("Union dues");
    // Row 2: the apprentice with cash in lieu; no overtime, so its overtime total and rate stay blank.
    expect(v[R[1].jobTitle]).toBe("Apprentice 2nd year");
    expect(v[R[1].ot.total]).toBe("");
    expect(v[R[1].ot.rate]).toBe("");
    expect(v[R[1].grossProject]).toBe("1024.00"); // 32 x 30.00 + 32 x 2.00 cash in lieu
    // Unused rows are cleared.
    expect(v[R[2].employee]).toBe("");
    // 4(c): per worker, per benefit type.
    const P = MW562.plans;
    expect(v[P[0].program]).toBe("Rivera, Ana L (Electrician)");
    expect(v[P[0].health]).toBe("21.00");
    expect(v[P[0].pension]).toBe("15.00");
    expect(v[P[0].account]).toBe("22-1234567");
    expect(v[P[1].health]).toBe("21.00");
    expect(v[P[1].pension]).toBe("");
    expect(v[MW562.certBoxes.fringePlans]).toBe(true);
    expect(v[MW562.certBoxes.fringeCash]).toBe(true);
    expect(v[MW562.cert.start]).toBe("07/26/26");
    expect(v[MW562.cert.end]).toBe("08/01/26");
    expect(v[MW562.cert.name]).toBe("Pat Owner");
    // Not signed unless asked.
    expect(v[MW562.certBoxes.eSign]).toBe(false);
    expect(v[MW562.cert.signDate]).toBe("");
    expect(r.rowsUsed).toBe(2);
  });

  it("signs only when the contractor asks, with today's date", () => {
    const v = buildNjCpr(payroll(), { ...job, sign: true }, workers, "2026-08-07").values ?? {};
    expect(v[MW562.certBoxes.eSign]).toBe(true);
    expect(v[MW562.cert.signDate]).toBe("08/07/26");
    const unnamed = buildNjCpr(
      payroll({ certifierName: "" }),
      { ...job, sign: true },
      workers,
      "2026-08-07",
    );
    expect(unnamed.values).toBeNull();
  });

  it("refuses a week that does not end on Saturday, a bad FEIN and too much state tax", () => {
    const sunday = buildNjCpr(payroll({ weekEnding: "2026-08-02" }), job, workers, "2026-08-07");
    expect(sunday.values).toBeNull();
    expect(sunday.issues.some((i) => /Sunday to Saturday/.test(i.message))).toBe(true);
    expect(buildNjCpr(payroll(), { ...job, fein: "12" }, workers, "2026-08-07").values).toBeNull();
    const tax = buildNjCpr(
      payroll(),
      job,
      [{ ...workers[0], stateTaxCents: 50_000 }, workers[1]],
      "x",
    );
    expect(tax.values).toBeNull();
  });

  it("refuses more rows than the form has, rather than a second sheet the Hub would overwrite", () => {
    const base = payroll().workers[0]!;
    const many = Array.from({ length: NJ_ROWS + 1 }, (_, i) => ({ ...base, lastName: `W${i}` }));
    const r = buildNjCpr(payroll({ workers: many }), job, [], "2026-08-07");
    expect(r.values).toBeNull();
    expect(r.issues.some((i) => /last submission/.test(i.message))).toBe(true);
  });

  it("warns about missing demographics and registration; a no-work week has no rows", () => {
    const r = buildNjCpr(payroll(), { fein: "221234567" }, [], "2026-08-07");
    expect(r.values).not.toBeNull();
    expect(r.issues.some((i) => /sex, race or ethnicity/.test(i.message))).toBe(true);
    expect(r.issues.some((i) => /Registration/.test(i.message))).toBe(true);
    const none = buildNjCpr(payroll({ workers: [] }), { ...job, noWork: true }, [], "2026-08-07");
    expect(none.values?.[MW562.boxes.noWork]).toBe(true);
    expect(none.values?.[R[0].employee]).toBe("");
    const contradict = buildNjCpr(payroll(), { ...job, noWork: true }, workers, "2026-08-07");
    expect(contradict.values).toBeNull();
  });

  it("checks the form's length limits", () => {
    const long = buildNjCpr(payroll({ projectName: "x".repeat(46) }), job, workers, "2026-08-07");
    expect(long.issues.some((i) => /45 characters/.test(i.message))).toBe(true);
  });
});

describe("helpers", () => {
  it("formats dates and FEINs and sorts plans", () => {
    expect(njDate("2026-08-01")).toBe("08/01/2026");
    expect(njDate("2026-08-01", true)).toBe("08/01/26");
    expect(njFein("22-1234567")).toBe("22-1234567");
    expect(njFein("2212345")).toBeNull();
    expect(njPlanKind("Annuity")).toBe("pension");
    expect(njPlanKind("Holiday")).toBe("vacation");
    expect(njPlanKind("Life insurance")).toBe("health");
    expect(njCprFileName("2026-08-01")).toBe("nj-mw562-2026-08-01.pdf");
    expect(njNextWeek({ address: "a", stateTaxCents: 5 })).toEqual({
      address: "a",
      stateTaxCents: 0,
    });
  });
});

// A form with the MW-562's field names (not NJDOL's file, which is not kept here).
function mw562Fixture() {
  const { text, boxes } = mw562FieldNames();
  const max = MW562.maxLen as Record<string, number>;
  return makeFormPdf([
    ...text.map((name) => ({
      name,
      kind: "text" as const,
      maxLen: max[name],
      value: name === MW562.header.contractorName ? "Arthur R" : undefined,
    })),
    ...boxes.map((name) => ({
      name,
      kind: "checkbox" as const,
      on: "On",
      value: name === MW562.boxes.subcontractor ? "On" : undefined,
    })),
  ]);
}

describe("filling the MW-562", () => {
  it("recognises the form and fills every field, clearing what was there", async () => {
    const pdf = mw562Fixture();
    expect(mw562Problem(await readFormFields(pdf))).toBeNull();
    const r = buildNjCpr(payroll({ role: "prime" }), job, workers, "2026-08-07");
    const out = await fillForm(pdf, r.values ?? {});
    const f = await readFormFields(out);
    expect(f.get(MW562.header.contractorName)?.value).toBe("Garden State Electric LLC");
    expect(f.get(MW562.boxes.subcontractor)?.value).toBe("Off");
    expect(f.get(MW562.boxes.contractor)?.value).toBe("On");
    expect(f.get(R[0].net)?.value).toBe("1911.50");
  });

  it("names a PDF that is not the MW-562", async () => {
    const other = await readFormFields(makeFormPdf([{ name: "Name", kind: "text" }]));
    expect(mw562Problem(other)).toMatch(/not NJDOL's fillable MW-562/);
  });

  // NJDOL's form is not vendored (it is NJDOL's file); point NJ_MW562 at a downloaded copy to fill
  // the real thing. NJ_MW562_OUT writes the filled file for a look in a PDF viewer.
  const real = process.env.NJ_MW562;
  it.skipIf(!real || !existsSync(real))("fills NJDOL's own MW-562", async () => {
    const pdf = new Uint8Array(readFileSync(real as string));
    const before = await readFormFields(pdf);
    expect(mw562Problem(before)).toBeNull();
    const r = buildNjCpr(payroll(), { ...job, sign: true }, workers, "2026-08-07");
    const out = await fillForm(pdf, r.values ?? {});
    if (process.env.NJ_MW562_OUT) writeFileSync(process.env.NJ_MW562_OUT, out);
    const f = await readFormFields(out);
    expect(f.get(MW562.header.contractorName)?.value).toBe("Garden State Electric LLC");
    expect(f.get(R[0].employee)?.value).toBe("Rivera, Ana L, 4 Elm St, Newark NJ");
    expect(f.get(MW562.boxes.subcontractor)?.value).toBe("On");
    expect(f.get(MW562.certBoxes.eSign)?.value).toBe("Yes");
  });
});
