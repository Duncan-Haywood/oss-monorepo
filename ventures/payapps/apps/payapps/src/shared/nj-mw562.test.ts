import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { certifiedPayrollSchema } from "./certified-payroll";
import {
  buildMw562,
  guessNjBenefitType,
  MW562_ROWS_PER_SHEET,
  mw562FileName,
  njDate,
  njMoney,
  njNextWeek,
} from "./nj-mw562";
import {
  MW562_DATES,
  MW562_HEADER,
  MW562_PAGE2,
  MW562_ROWS,
  mw562FieldNames,
  mw562ProgramRow,
} from "./nj-mw562-fields";
import { fillForm, readFormFields } from "./pdf/form-fill";

// A Trenton electrical sub, the week ending Saturday 2026-08-01 (Sunday 7/26 to Saturday 8/1).
const worker = (lastName: string, over: Record<string, unknown> = {}) => ({
  lastName,
  firstName: "Sam",
  rows: [
    {
      classification: "Electrician",
      status: "J",
      st: [0, 800, 800, 800, 800, 800, 0],
      ot: [0, 200, 0, 0, 0, 0, 0],
      stRateCents: 5_250,
      otRateCents: 7_875,
    },
  ],
  taxCents: 30_000,
  ficaCents: 17_000,
  otherCents: 4_000,
  fringeCreditsCents: [1_200, 900],
  ...over,
});

const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Trenton Library HVAC",
    projectNumber: "T-2231",
    payrollNo: "3",
    businessName: "Delaware Valley Electric LLC",
    businessAddress: "12 Front St, Trenton NJ 08608",
    projectLocation: "Mercer County, NJ",
    wageDeterminations: "NJ PW Mercer 2026-07",
    weekEnding: "2026-08-01",
    certifierName: "Pat Rivera",
    certifierTitle: "Owner",
    workers: [
      worker("Bradley", { middleInitial: "M" }),
      worker("Johnson", {
        rows: [
          {
            classification: "Laborer",
            status: "RA",
            apprenticeLevel: "2nd year",
            st: [0, 800, 800, 800, 800, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 2_500,
            otRateCents: 3_750,
            cashInLieuHourlyCents: 300,
          },
        ],
        taxCents: 8_000,
        ficaCents: 7_700,
        otherCents: 0,
        fringeCreditsCents: [1_200, 0],
      }),
    ],
    apprenticeships: [
      { program: "NJ Laborers Training", registeredWith: "OA", classification: "Laborer" },
    ],
    fringePlans: [
      { name: "IBEW Local 269 Health Fund", type: "Health", planNo: "22-1234567" },
      { name: "NEBF", type: "Pension", planNo: "53-0181657" },
    ],
    ...over,
  });

const nj = [
  {
    address: "4 Elm St, Ewing NJ",
    sex: "M",
    race: "W",
    ethnicity: "N",
    stateTaxCents: 9_000,
    njContribCents: 1_500,
  },
  { address: "9 Oak Ave, Trenton NJ", sex: "F", race: "B", ethnicity: "H", stateTaxCents: 2_000 },
] as const;
const job = { fein: "12-3456789", registrationNo: "PW-000123", datePaid: "2026-08-07" };

describe("buildMw562", () => {
  it("fills the header, the week's dates by weekday and each row's hours, rates and pay", () => {
    const r = buildMw562(payroll(), job, [...nj]);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.sheets).toHaveLength(1);
    const v = r.sheets[0] as Record<string, string | boolean>;
    expect(v[MW562_HEADER.contractorName]).toBe("Delaware Valley Electric LLC");
    expect(v[MW562_HEADER.subcontractor]).toBe(true);
    expect(v[MW562_HEADER.contractor]).toBe(false);
    expect(v[MW562_HEADER.weekEnd]).toBe("08/01/2026");
    expect(v[MW562_HEADER.datePaid]).toBe("08/07/2026");
    expect(v[MW562_HEADER.registration]).toBe("PW-000123");
    expect(v[MW562_HEADER.noWorkWeek]).toBe(false);
    expect(MW562_DATES.map((d) => v[d])).toEqual([
      "7/26",
      "7/27",
      "7/28",
      "7/29",
      "7/30",
      "7/31",
      "8/1",
    ]);

    const row = MW562_ROWS[0];
    expect(v[row.employee]).toBe("Bradley, Sam M\n4 Elm St, Ewing NJ");
    expect(v[row.jobTitle]).toBe("Journeyman");
    expect(v[row.workCategory]).toBe("Electrician");
    expect([v[row.sex], v[row.race], v[row.ethnicity]]).toEqual(["M", "W", "N"]);
    expect(row.st.map((n) => v[n])).toEqual(["", "8", "8", "8", "8", "8", ""]);
    expect(row.ot.map((n) => v[n])).toEqual(["", "2", "", "", "", "", ""]);
    expect(v[row.stTotal]).toBe("40");
    expect(v[row.otTotal]).toBe("2");
    expect(v[row.stRate]).toBe("52.50");
    expect(v[row.otRate]).toBe("78.75");
    // 40 x 52.50 + 2 x 78.75 = 2,257.50
    expect(v[row.grossProject]).toBe("2257.50");
    expect(v[row.grossWeek]).toBe("2257.50");
    // Withholding 300 split: 90 state, 210 federal; other 40 split: 15 UI/DI/FLI, 25 other.
    expect(v[row.withholding]).toBe("210.00");
    expect(v[row.stateTax]).toBe("90.00");
    expect(v[row.fica]).toBe("170.00");
    expect(v[row.other1]).toBe("25.00");
    expect(v[row.other2]).toBe("15.00");
    expect(v[row.totalDeductions]).toBe("510.00");
    expect(v[row.net]).toBe("1747.50");
    // 12 + 9 an hour.
    expect(v[row.totalFringe]).toBe("21.00");

    const row2 = MW562_ROWS[1];
    expect(v[row2.jobTitle]).toBe("Apprentice, 2nd year");
    expect(v[row2.otTotal]).toBe("");
    // 12 a hour to the plan plus 3 in cash.
    expect(v[row2.totalFringe]).toBe("15.00");
    // Unused rows are blank.
    expect(v[(MW562_ROWS[2] as (typeof MW562_ROWS)[number]).employee]).toBe("");
  });

  it("puts a week ending on a Friday in the columns of each day's weekday", () => {
    const r = buildMw562(payroll({ weekEnding: "2026-07-31" }), job, [...nj]);
    const v = r.sheets[0] as Record<string, string | boolean>;
    // Saturday 7/25 to Friday 7/31: Sunday's column holds 7/26, Saturday's 7/25.
    expect(MW562_DATES.map((d) => v[d])).toEqual([
      "7/26",
      "7/27",
      "7/28",
      "7/29",
      "7/30",
      "7/31",
      "7/25",
    ]);
    // Bradley's st is [Sa 0, Su 8, Mo 8, Tu 8, We 8, Th 8, Fr 0] in date order.
    expect(MW562_ROWS[0].st.map((n) => v[n])).toEqual(["8", "8", "8", "8", "8", "", ""]);
  });

  it("fills 4(c) per classification with the hourly credit by benefit type", () => {
    const r = buildMw562(payroll(), job, [...nj]);
    const v = r.sheets[0] as Record<string, string | boolean>;
    expect(r.programRows).toBe(2);
    const p0 = mw562ProgramRow(0);
    expect(v[p0.program]).toBe("Electrician");
    expect(v[p0.health]).toBe("12.00");
    expect(v[p0.pension]).toBe("9.00");
    expect(v[p0.vacation]).toBe("");
    expect(v[p0.administrator]).toBe("IBEW Local 269 Health Fund; NEBF");
    expect(v[p0.filingNo]).toBe("22-1234567; 53-0181657");
    const p1 = mw562ProgramRow(1);
    expect(v[p1.program]).toBe("Laborer");
    expect(v[p1.pension]).toBe("");
    expect(v[mw562ProgramRow(17).program]).toBe("");
    expect(mw562ProgramRow(17).health).toBe("health1.16.1");
    expect(v[MW562_PAGE2.fringePlans]).toBe(true);
    expect(v[MW562_PAGE2.fringeCash]).toBe(true);
    expect(v[MW562_PAGE2.startDate]).toBe("07/26/26");
    expect(v[MW562_PAGE2.endDate]).toBe("08/01/26");
    expect(v[MW562_PAGE2.eSign]).toBe(false);
    expect(v[MW562_PAGE2.name]).toBe("Pat Rivera");
  });

  it("checks the split against the WH-347 and warns about missing demographics and IDs", () => {
    const r = buildMw562(payroll(), {}, [{ stateTaxCents: 99_999 }, {}]);
    const msgs = r.issues.map((i) => `${i.level}: ${i.message}`);
    expect(msgs.some((m) => m.startsWith("error: State tax is part of"))).toBe(true);
    expect(msgs.some((m) => m.includes("FEIN"))).toBe(true);
    expect(msgs.some((m) => m.includes("registration number"))).toBe(true);
    expect(msgs.filter((m) => m.includes("Sex, race and ethnicity")).length).toBe(2);
  });

  it("makes more sheets past ten rows, and a no-work week with no workers", () => {
    const many = payroll({
      workers: Array.from({ length: 12 }, (_, i) => worker(`W${i}`)),
    });
    const r = buildMw562(many, job, []);
    expect(r.sheets).toHaveLength(2);
    const s2 = r.sheets[1] as Record<string, string | boolean>;
    expect(s2[(MW562_ROWS[0] as (typeof MW562_ROWS)[number]).employee]).toBe("W10, Sam");
    expect(s2[MW562_HEADER.additionalSheets]).toBe(true);
    expect(MW562_ROWS_PER_SHEET).toBe(10);

    const none = buildMw562(payroll({ workers: [] }), job, []);
    expect(none.sheets).toHaveLength(1);
    expect((none.sheets[0] as Record<string, unknown>)[MW562_HEADER.noWorkWeek]).toBe(true);
  });
});

describe("the field map", () => {
  it("names 555 distinct fields, and every sheet sets each of them", () => {
    const names = mw562FieldNames();
    expect(names).toHaveLength(555);
    expect(new Set(names).size).toBe(555);
    const sheet = buildMw562(payroll(), job, [...nj]).sheets[0] as Record<string, unknown>;
    expect(Object.keys(sheet).sort()).toEqual([...names].sort());
  });
});

describe("helpers", () => {
  it("formats dates and money as the form's scripts read them", () => {
    expect(njDate("2026-08-01", "mm/dd/yyyy")).toBe("08/01/2026");
    expect(njDate("2026-08-01", "mm/dd/yy")).toBe("08/01/26");
    expect(njDate("2026-08-01", "m/d")).toBe("8/1");
    expect(njDate("", "m/d")).toBe("");
    expect(njMoney(123456)).toBe("1234.56");
    expect(guessNjBenefitType("Vacation fund")).toBe("vacation");
    expect(guessNjBenefitType("Annuity")).toBe("pension");
    expect(mw562FileName("3", "2026-08-01")).toBe("mw-562-3-2026-08-01.pdf");
    expect(mw562FileName("3", "2026-08-01", 2, 3)).toBe("mw-562-3-2026-08-01-sheet-2-of-3.pdf");
    expect(njNextWeek({ address: "x", sex: "M", stateTaxCents: 5, njContribCents: 2 })).toEqual({
      address: "x",
      sex: "M",
      stateTaxCents: 0,
      njContribCents: 0,
    });
  });
});

// NJDOL's form is not vendored (it is NJDOL's file); point MW562_PDF at a downloaded copy of the
// 2/25 revision (nj.gov prevailing-rates updates page) to check every mapped name against it and fill it.
const real = process.env.MW562_PDF;
describe.skipIf(!real || !existsSync(real))("against NJDOL's MW-562 (2/25)", () => {
  it("has every field the map names, of the right kind, and fills clean", async () => {
    const bytes = new Uint8Array(readFileSync(real as string));
    const fields = await readFormFields(bytes);
    const r = buildMw562(payroll(), { ...job, eSign: true, signDate: "2026-08-07" }, [...nj]);
    const values = r.sheets[0] as Record<string, string | boolean>;
    // Every field on the form is mapped, once, and set by the builder.
    expect(mw562FieldNames().sort()).toEqual([...fields.keys()].sort());
    expect(Object.keys(values).sort()).toEqual([...fields.keys()].sort());
    for (const [name, value] of Object.entries(values)) {
      expect(fields.get(name)?.kind, name).toBe(typeof value === "boolean" ? "checkbox" : "text");
    }
    const out = await fillForm(bytes, values, { clearOthers: true });
    const after = await readFormFields(out);
    for (const [name, value] of Object.entries(values)) {
      expect(after.get(name)?.value ?? (typeof value === "boolean" ? false : ""), name).toBe(value);
    }
    if (process.env.MW562_OUT) (await import("node:fs")).writeFileSync(process.env.MW562_OUT, out);
  });
});
