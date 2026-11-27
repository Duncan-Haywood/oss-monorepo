import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certifiedPayrollSchema } from "./certified-payroll";
import { WA_COUNTIES, WA_TRADES } from "./wa-codes";
import {
  buildWaCpr,
  guessWaBenefitType,
  normalizeSsn,
  ssnProblem,
  WA_CASH_IN_LIEU_NAME,
  type WaWorkerInput,
  waCounty,
  waCprFileName,
  waNextWeek,
  waTradeCode,
} from "./wa-cpr";

// A Tacoma electrical sub on a school job, the week ending Saturday 2026-08-01.
const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Lincoln Elementary Modernization",
    payrollNo: "4",
    businessName: "Narrows Electric LLC",
    businessAddress: "1201 Pacific Ave, Tacoma WA",
    projectLocation: "Pierce County, WA",
    wageDeterminations: "L&I rates, bid due 2026-03-10",
    weekEnding: "2026-08-01",
    fringePlans: [
      { name: "NECA-IBEW Health", type: "Health and welfare" },
      { name: "NEBF pension", type: "Pension" },
      { name: "Tool allowance", type: "" },
    ],
    apprenticeships: [
      {
        program: "Puget Sound Electrical JATC",
        registeredWith: "SAA",
        classification: "Inside Wireman",
      },
    ],
    workers: [
      {
        lastName: "Ortiz",
        firstName: "Ana",
        middleInitial: "R",
        idNo: "6789",
        rows: [
          {
            classification: "Journey Level",
            status: "J",
            st: [0, 800, 800, 800, 800, 800, 0],
            ot: [0, 200, 0, 0, 0, 0, 0],
            stRateCents: 6_512,
            otRateCents: 9_768,
          },
          {
            classification: "Journey Level",
            status: "J",
            st: [0, 0, 0, 0, 0, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 400],
            stRateCents: 6_512,
            otRateCents: 13_024,
            cashInLieuHourlyCents: 150,
          },
        ],
        taxCents: 32_000,
        ficaCents: 22_500,
        otherCents: 4_100,
        otherNote: "Union dues",
        fringeCreditsCents: [1_800, 1_250, 75],
      },
      {
        lastName: "Nguyen",
        firstName: "Tom",
        idNo: "",
        rows: [
          {
            classification: "Electrician apprentice",
            status: "RA",
            apprenticeLevel: "Step 3",
            st: [0, 800, 800, 800, 800, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 3_250,
            otRateCents: 4_875,
          },
        ],
        taxCents: 9_000,
        ficaCents: 8_000,
        fringeCreditsCents: [1_800, 600],
      },
    ],
    ...over,
  });

const job = { intentId: "1234567", county: "pierce" };
const workers: WaWorkerInput[] = [
  {
    address1: "88 S 9th St",
    city: "Tacoma",
    state: "wa",
    zip: "98402",
    gender: "F",
    rows: [{ trade: "elec" }, { trade: "ELEC", doubleTime: true }],
  },
  {
    address1: "14 Main St",
    address2: "Apt 2",
    city: "Puyallup",
    state: "WA",
    zip: "98371-1234",
    rows: [
      {
        trade: "ELEC",
        apprenticeId: "A123456",
        apprenticeOccupation: "Inside Wireman",
        apprenticeStep: "Step 3",
        stepBeginHours: 2000,
        stepEndHours: 3000,
      },
    ],
  },
];
const ids = [{ ssn: "123-45-6789" }, { ssn: "234 56 7890" }];

describe("Washington L&I certified payroll XML", () => {
  it("builds the week with L&I's trades, counties, benefit types and double time", () => {
    const r = buildWaCpr(payroll(), job, workers, ids);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const xml = r.xml ?? "";
    expect(xml).toContain("<intentId>1234567</intentId>");
    expect(xml).toContain("<endOfWeekDate>2026-08-01</endOfWeekDate>");
    expect(xml).toContain("<noWorkPerformFlag>false</noWorkPerformFlag>");
    expect(xml).toContain("<ssn>123456789</ssn>");
    expect(xml).toContain("<ssn>234567890</ssn>");
    expect(xml).toContain("<state>WA</state>");
    expect(xml).toContain("<county>Pierce</county>");
    expect(xml).toContain("<trade>ELEC</trade>");
    expect(xml).toContain("<jobClass>Journey Level</jobClass>");
    // Health and pension in L&I's fixed fields; the unnamed plan as a named extra benefit.
    expect(xml).toContain("<hourlyMedicalAmt>18.00</hourlyMedicalAmt>");
    expect(xml).toContain("<hourlyPensionRateAmt>12.50</hourlyPensionRateAmt>");
    expect(xml).toContain("<benefitHourlyName>Tool allowance</benefitHourlyName>");
    expect(xml).toContain(`<benefitHourlyName>${WA_CASH_IN_LIEU_NAME}</benefitHourlyName>`);
    // Row 1 overtime, row 2 double time.
    expect(xml).toContain("<overtimeHourRateAmt>97.68</overtimeHourRateAmt>");
    expect(xml).toContain("<overtimeDay2Hours>2.00</overtimeDay2Hours>");
    expect(xml).toContain("<doubletimeHourRateAmt>130.24</doubletimeHourRateAmt>");
    expect(xml).toContain("<doubletimeDay7Hours>4.00</doubletimeDay7Hours>");
    // Deductions as on the WH-347.
    expect(xml).toContain("<fica>225.00</fica>");
    expect(xml).toContain("<taxWitholding>320.00</taxWitholding>");
    expect(xml).toContain("<deductionName>Union dues</deductionName>");
    expect(xml).toContain("<deductionHourlyAmt>41.00</deductionHourlyAmt>");
    // The apprentice: no jobClass, the ARTS fields, training fund 0.
    const tom = xml.slice(xml.indexOf("<firstName>Tom"));
    expect(tom).not.toContain("<jobClass>");
    expect(tom).toContain("<apprenticeFlg>true</apprenticeFlg>");
    expect(tom).toContain("<apprenticeState>WA</apprenticeState>");
    expect(tom).toContain("<apprenticeStepBeginHours>2000</apprenticeStepBeginHours>");
    expect(tom).toContain("<address2>Apt 2</address2>");
    // Obsolete elements are left out, as the guide asks.
    expect(xml).not.toMatch(/WageId|apprenticePgmOccpnId|apprenticePgmName|amendedFlag/);
  });

  it("gross pay is the WH-347 gross for all work", () => {
    const r = buildWaCpr(payroll(), job, workers, ids);
    const ana = r.employees[0];
    // 40 h x 65.12 + 2 h x 97.68 + 4 h x 130.24 + 4 h x 1.50 cash in lieu.
    expect(ana?.grossCents).toBe(260_480 + 19_536 + 52_096 + 600);
    expect(r.employees[1]?.grossCents).toBe(32 * 3_250);
  });

  it("needs the Intent ID, full SSNs, addresses, a trade and a county", () => {
    const r = buildWaCpr(
      payroll(),
      { intentId: "", county: "" },
      [{ rows: [{ trade: "ELEX" }] }, {}],
      [{ ssn: "6789" }, undefined],
    );
    const msgs = r.issues.filter((i) => i.level === "error").map((i) => i.message);
    expect(r.xml).toBeNull();
    expect(msgs.some((m) => m.includes("Intent ID"))).toBe(true);
    expect(msgs.some((m) => m.includes("9 digits"))).toBe(true);
    expect(msgs.some((m) => m.includes("full Social Security number"))).toBe(true);
    expect(msgs.some((m) => m.includes('"ELEX" is not one of'))).toBe(true);
    expect(msgs.some((m) => m.includes("street address"))).toBe(true);
    expect(msgs.some((m) => m.includes("county of the work"))).toBe(true);
    expect(msgs.some((m) => m.includes("registration ID"))).toBe(true);
  });

  it("rejects never-issued SSNs and duplicates", () => {
    expect(ssnProblem("912345678")).toMatch(/starts with 9/);
    expect(ssnProblem("666123456")).toMatch(/666/);
    expect(ssnProblem("123006789")).toMatch(/00/);
    expect(ssnProblem("123450000")).toMatch(/0000/);
    expect(ssnProblem("123456789")).toBeNull();
    expect(normalizeSsn(" 123-45-6789 ")).toBe("123456789");
    const r = buildWaCpr(payroll(), job, workers, [ids[0], ids[0]]);
    expect(r.issues.some((i) => i.message.startsWith("Same SSN as worker 1"))).toBe(true);
  });

  it("checks the apprentice's state and step hours", () => {
    const w2 = {
      ...workers[1],
      rows: [{ ...workers[1]?.rows?.[0], apprenticeState: "ID", stepEndHours: 1000 }],
    };
    const r = buildWaCpr(payroll(), job, [workers[0] ?? {}, w2], ids);
    const msgs = r.issues.map((i) => i.message);
    expect(msgs).toContain("L&I takes apprentices registered in WA, OR, MT or AK");
    expect(msgs).toContain("The step's end hours are before its begin hours");
  });

  it("a row's own county wins over the job's; a bad county is named", () => {
    const w = {
      ...workers[0],
      rows: [
        { trade: "ELEC", county: "King County" },
        { trade: "ELEC", county: "Multnomah" },
      ],
    };
    const r = buildWaCpr(payroll(), job, [w, workers[1] ?? {}], ids);
    expect(r.employees[0]?.trades[0]?.county).toBe("King");
    expect(r.issues.some((i) => i.message === '"Multnomah" is not a Washington county')).toBe(true);
  });

  it("a no-work week has no employees and fails if anyone has hours", () => {
    const empty = payroll({ workers: [] });
    const r = buildWaCpr(empty, { ...job, noWork: true }, [], []);
    expect(r.xml).toContain("<noWorkPerformFlag>true</noWorkPerformFlag>");
    expect(r.xml).not.toContain("<employees>");
    const bad = buildWaCpr(payroll(), { ...job, noWork: true }, workers, ids);
    expect(bad.xml).toBeNull();
  });

  it("warns when overtime looks like double time but is not marked", () => {
    const w = { ...workers[0], rows: [{ trade: "ELEC" }, { trade: "ELEC" }] };
    const r = buildWaCpr(payroll(), job, [w, workers[1] ?? {}], ids);
    expect(
      r.issues.some((i) => i.level === "warning" && i.message.includes("double the straight rate")),
    ).toBe(true);
  });

  it("codes, counties and helpers", () => {
    expect(WA_TRADES).toHaveLength(99);
    expect(WA_COUNTIES).toHaveLength(39);
    expect(waTradeCode(" plum ")).toBe("PLUM");
    expect(waTradeCode("XXXX")).toBeNull();
    expect(waCounty("walla  walla")).toBe("Walla Walla");
    expect(waCounty("PEND OREILLE county")).toBe("Pend Oreille");
    expect(guessWaBenefitType("Health and welfare")).toBe("medical");
    expect(guessWaBenefitType("Vacation/holiday")).toBe("vacation");
    expect(guessWaBenefitType("JATC training")).toBe("training");
    expect(waCprFileName("12 345", "2026-08-01")).toBe("wa-cpr-12345-2026-08-01.xml");
    expect(waNextWeek(workers[0] ?? {}).address1).toBe("88 S 9th St");
  });

  it("escapes text", () => {
    const r = buildWaCpr(
      payroll(),
      job,
      [{ ...workers[0], address1: "5 <A> & B St" }, workers[1] ?? {}],
      ids,
    );
    expect(r.xml).toContain("5 &lt;A&gt; &amp; B St");
  });

  // L&I's schema is not vendored (it is L&I's file); point WA_CPR_XSD at a downloaded copy of
  // https://www.lni.wa.gov/licensing-permits/_docs/xmlschema.xsd to check the output with xmllint.
  const xsd = process.env.WA_CPR_XSD;
  it.skipIf(!xsd || !existsSync(xsd))("validates against L&I's schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "wacpr-"));
    for (const [name, r] of [
      ["two.xml", buildWaCpr(payroll(), job, workers, ids)],
      ["nowork.xml", buildWaCpr(payroll({ workers: [] }), { ...job, noWork: true }, [], [])],
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
