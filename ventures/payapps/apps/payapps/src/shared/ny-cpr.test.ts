import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certifiedPayrollSchema } from "./certified-payroll";
import { NY_CLASSIFICATIONS } from "./ny-classifications";
import {
  buildNyCpr,
  dec2,
  fullStateName,
  guessSupplementType,
  matchNyClassification,
  NY_CASH_IN_LIEU_EXPLANATION,
  nyCprFileName,
  nyNextWeek,
} from "./ny-cpr";

// An Albany electrical sub, the week ending Sunday 2026-08-02.
const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Capitol Annex Lighting",
    payrollNo: "3",
    businessName: "Hudson Electric LLC",
    businessAddress: "5 State St, Albany NY",
    projectLocation: "Albany County, NY",
    wageDeterminations: "PRC 2026001234",
    weekEnding: "2026-08-02",
    workers: [
      {
        lastName: "Bradley",
        firstName: "Steven",
        middleInitial: "M",
        idNo: "0323",
        rows: [
          {
            classification: "Electrician - Building/Wireman",
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
        otherNote: "NY PFL and union dues",
        fringeCreditsCents: [1_200, 900],
      },
      {
        lastName: "Johnson",
        firstName: "Emily",
        idNo: "",
        rows: [
          {
            classification: "Laborer – Building",
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
        fringeCreditsCents: [1_200, 0],
      },
    ],
    apprenticeships: [{ program: "Laborers JATC", registeredWith: "SAA" }],
    fringePlans: [
      { name: "IBEW Local 236 Health", type: "Health" },
      { name: "Local 236 Annuity", type: "Annuity" },
    ],
    certifierName: "Pat Owner",
    ...over,
  });

const job = { prcNumber: "2026001234" };
const address = { address1: "124 Main St", city: "Albany", state: "ny", zip: "12207-0002" };
const workers = [
  {
    ...address,
    address2: "Apt 2",
    stateTaxCents: 9_000,
    disabilityPflCents: 1_500,
    duesCents: 2_000,
    rows: [{ category: "" }],
  },
  { ...address, zip: "12203" },
];
const ids = [{ dob: "" }, { dob: "1999-04-30" }];

describe("helpers", () => {
  it("formats decimals, guesses supplement types, spells out states, matches classifications", () => {
    expect(dec2(850)).toBe("8.50");
    expect(dec2(7)).toBe("0.07");
    expect(guessSupplementType("Health")).toBe("Health/Welfare");
    expect(guessSupplementType("Annuity fund")).toBe("Pension");
    expect(guessSupplementType("JATC training")).toBe("Apprenticeship/Training");
    expect(guessSupplementType("Legal services")).toBe("Other Benefit (Type)");
    expect(fullStateName("ny")).toBe("New York");
    expect(fullStateName("new jersey")).toBe("New Jersey");
    expect(fullStateName("Nowhere")).toBeNull();
    expect(matchNyClassification("electrician - building/wireman")).toBe(
      "Electrician – Building/Wireman",
    );
    expect(matchNyClassification("Laborer  –  Building")).toBe("Laborer – Building");
    expect(matchNyClassification("Electrician")).toBeNull();
    expect(nyCprFileName("2026001234", "2026-08-02")).toBe("ny-cpr-2026001234-2026-08-02.xml");
  });

  it("carries NYSDOL's list as printed (261 names, no blanks or repeats)", () => {
    expect(NY_CLASSIFICATIONS.length).toBe(261);
    expect(new Set(NY_CLASSIFICATIONS).size).toBe(261);
    expect(NY_CLASSIFICATIONS).toContain("Boiler Maker – Building");
    expect(NY_CLASSIFICATIONS.every((n) => n.trim() === n && n.length > 0)).toBe(true);
  });
});

describe("buildNyCpr", () => {
  it("builds the file from the WH-347 payroll and the New York extras", () => {
    const r = buildNyCpr(payroll(), job, workers, ids);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const [a, b] = r.employees;
    if (!a || !b) throw new Error("two employees");
    // Identity: last four from the WH-347 ID no.; the second worker has none, so the date of birth.
    expect(a.ssnLast4).toBe("0323");
    expect(a.dob).toBe("");
    expect(b.ssnLast4).toBe("");
    expect(b.dob).toBe("1999-04-30");
    expect(a.address.state).toBe("New York");
    expect(a.address.zip).toBe("12207");
    expect(a.address.zipExt).toBe("0002");
    expect(a.apprentice).toBe(false);
    expect(b.apprentice).toBe(true);
    expect(a.workWeeks[0]?.category).toBe("Electrician – Building/Wireman");
    // Gross: 40 x 52.50 + 2 x 78.75 = 2,257.50; deductions 300 + 170 + 40 = 510; net 1,747.50.
    expect(a.grossCents).toBe(225_750);
    expect(a.netCents).toBe(174_750);
    expect(a.deductions).toEqual([
      { type: "Federal Tax", cents: 21_000 },
      { type: "FICA", cents: 17_000 },
      { type: "State Tax", cents: 9_000 },
      { type: "Disability/Paid Family Leave", cents: 1_500 },
      { type: "Union Dues", cents: 2_000 },
      { type: "NY PFL and union dues", cents: 500 },
    ]);
    expect(sumCents(a.deductions)).toBe(a.grossCents - a.netCents);
    expect(a.supplements).toEqual([
      {
        type: "Health/Welfare",
        category: "Electrician – Building/Wireman",
        explanation: "",
        stRateCents: 1_200,
        otRateCents: 1_200,
      },
      {
        type: "Pension",
        category: "Electrician – Building/Wireman",
        explanation: "",
        stRateCents: 900,
        otRateCents: 900,
      },
    ]);
    // Cash in lieu: "Other Benefit (Type)" with the explanation the guide requires for that type.
    expect(b.supplements.at(-1)).toEqual({
      type: "Other Benefit (Type)",
      category: "Laborer – Building",
      explanation: NY_CASH_IN_LIEU_EXPLANATION,
      stRateCents: 300,
      otRateCents: 300,
    });
    const xml = r.xml ?? "";
    expect(xml).toContain("<prcNumber>2026001234</prcNumber>");
    expect(xml).toContain("<weekEndingDate>2026-08-02T00:00:00.000Z</weekEndingDate>");
    expect(xml).toContain("<state>New York</state>");
    expect(xml).toContain("<deductionsGrossEarnings>2257.50</deductionsGrossEarnings>");
    expect(xml).toContain("<netWages>1747.50</netWages>");
    expect(xml).toContain("<day>2026-07-27</day>");
    expect(xml).toContain("<day>2026-08-02</day>");
    expect(xml.match(/<employeeWorkWeek>/g)?.length).toBe(2);
    // Never both identifiers on one worker (the guide's "DOB and SSN Last 4 Digits" error).
    for (const e of xml.split("<employeeWorkWeek>").slice(1)) {
      expect(e.includes("<dateOfBirth>") && e.includes("<ssnLast4>")).toBe(false);
    }
    expect(xml).not.toContain("<explanation></explanation>");
  });

  it("pays a plan at time and a half on overtime where the schedule says so", () => {
    const r = buildNyCpr(payroll(), { ...job, planOtTimeAndHalf: [true, false] }, workers, ids);
    expect(r.employees[0]?.supplements[0]?.otRateCents).toBe(1_800);
    expect(r.employees[0]?.supplements[1]?.otRateCents).toBe(900);
  });

  it("a plan typed Other carries its name as the explanation", () => {
    const r = buildNyCpr(
      payroll(),
      { ...job, planTypes: [null, "Other Benefit (Type)"] },
      workers,
      ids,
    );
    expect(r.employees[0]?.supplements[1]?.explanation).toBe("Local 236 Annuity, Annuity");
  });

  it("refuses what the portal rejects", () => {
    const bad = buildNyCpr(
      payroll({
        workers: [
          {
            ...payroll().workers[0],
            rows: [
              {
                ...payroll().workers[0]?.rows[0],
                classification: "Electrician",
                stRateCents: 100_000,
              },
            ],
          },
          { ...payroll().workers[0] },
        ],
      }),
      { prcNumber: "123" },
      [{ address1: "x".repeat(43), city: "Albany", state: "Nowhere", zip: "1220" }, { ...address }],
      [],
    );
    const msgs = bad.issues.filter((i) => i.level === "error").map((i) => i.message);
    expect(bad.xml).toBeNull();
    expect(msgs.some((m) => m.includes("PRC number"))).toBe(true);
    expect(msgs.some((m) => m.includes("42 characters"))).toBe(true);
    expect(msgs.some((m) => m.includes("state"))).toBe(true);
    expect(msgs.some((m) => m.includes("ZIP"))).toBe(true);
    expect(msgs.some((m) => m.includes("NYSDOL's list"))).toBe(true);
    expect(msgs.some((m) => m.includes("$999.99"))).toBe(true);
    expect(msgs.some((m) => m.includes("duplicated employee"))).toBe(true);
  });

  it("needs the SSN's last four or a date of birth", () => {
    const r = buildNyCpr(payroll(), job, workers, [{ dob: "" }, { dob: "" }]);
    expect(r.xml).toBeNull();
    expect(
      r.issues.some((i) => i.where.startsWith("Worker 2") && i.message.includes("date of birth")),
    ).toBe(true);
    const bad = buildNyCpr(payroll(), job, workers, [{ dob: "" }, { dob: "1999-02-30" }]);
    expect(bad.issues.some((i) => i.message.includes("YYYY-MM-DD"))).toBe(true);
  });

  it("a split larger than the WH-347 amount it comes out of is an error", () => {
    const r = buildNyCpr(
      payroll(),
      job,
      [{ ...workers[0], stateTaxCents: 40_000 }, workers[1]],
      ids,
    );
    expect(r.issues.some((i) => i.message.includes("State and local income tax"))).toBe(true);
  });

  it("next week keeps addresses and classifications and clears the split", () => {
    const n = nyNextWeek(workers[0] ?? {});
    expect(n.address1).toBe("124 Main St");
    expect(n.rows).toEqual([{ category: "" }]);
    expect(n.stateTaxCents).toBe(0);
    expect(n.duesCents).toBe(0);
  });

  // NYSDOL's XSD is not vendored (it is NYSDOL's file); point NY_CPR_XSD at a downloaded copy of
  // https://dol.ny.gov/certpayrollxsd (a zip holding NYDOL_CertPayroll UPDATED.xsd) to check the
  // output with xmllint.
  const xsd = process.env.NY_CPR_XSD;
  it.skipIf(!xsd || !existsSync(xsd))("validates against NYSDOL's XSD", () => {
    const dir = mkdtempSync(join(tmpdir(), "nycpr-"));
    for (const [name, r] of [
      ["two.xml", buildNyCpr(payroll(), job, workers, ids)],
      ["ot.xml", buildNyCpr(payroll(), { ...job, planOtTimeAndHalf: [true, true] }, workers, ids)],
    ] as const) {
      expect(r.xml).not.toBeNull();
      const f = join(dir, name);
      writeFileSync(f, r.xml ?? "");
      const out = execFileSync("xmllint", ["--noout", "--schema", xsd ?? "", f], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toBe("");
    }
  });
});

const sumCents = (xs: readonly { cents: number }[]) => xs.reduce((a, x) => a + x.cents, 0);
