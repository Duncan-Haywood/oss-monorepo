import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEcpr,
  dec2,
  ecprFileName,
  ecprNextWeek,
  guessFringeCategory,
  normalizeTaxId,
  periodFromLevel,
} from "./ca-ecpr";
import { certifiedPayrollSchema } from "./certified-payroll";

// A Sacramento drywall sub, DIR's sample week (ending Sunday 2026-07-12).
const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Elm School Modernization",
    payrollNo: "4",
    businessName: "Valley Drywall Inc",
    businessAddress: "12 J St, Sacramento CA",
    projectLocation: "Sacramento County, CA",
    wageDeterminations: "SAC-2025-1 Drywall Installer/Lather",
    weekEnding: "2026-07-12",
    workers: [
      {
        lastName: "Lopez",
        firstName: "Ana",
        middleInitial: "M",
        idNo: "6789",
        rows: [
          {
            classification: "Drywall Installer/Lather",
            status: "J",
            st: [800, 800, 800, 800, 800, 0, 0],
            ot: [100, 0, 0, 0, 0, 0, 0],
            stRateCents: 5_250,
            otRateCents: 7_875,
          },
        ],
        taxCents: 30_000,
        ficaCents: 17_000,
        otherCents: 4_000,
        fringeCreditsCents: [1_200, 900],
      },
      {
        lastName: "Ng",
        firstName: "Tom",
        idNo: "1111",
        rows: [
          {
            classification: "Drywall Installer/Lather",
            status: "RA",
            apprenticeLevel: "3rd period, 60%",
            st: [800, 800, 800, 800, 0, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 3_150,
            otRateCents: 4_725,
          },
        ],
        taxCents: 8_000,
        ficaCents: 7_700,
        fringeCreditsCents: [1_200, 500],
      },
    ],
    apprenticeships: [{ program: "Drywall JATC", registeredWith: "SAA" }],
    fringePlans: [
      { name: "Carpenters Health Trust", type: "Health" },
      { name: "Carpenters Pension Trust", type: "Pension" },
    ],
    certifierName: "Pat Owner",
    ...over,
  });

const job = { pwcr: "2000024488", projectId: "100004", awardingBody: "Elm USD" };
const address = { street: "100 Common Street", city: "Sacramento", state: "ca", zip: "95814" };
const workers = [
  {
    ...address,
    checkNum: "10451",
    stateTaxCents: 9_000,
    sdiCents: 4_000,
    rows: [{ craft: "Carpenter", dt: [0, 0, 0, 0, 0, 200, 0], dtRateCents: 10_500 }],
  },
  { ...address, checkNum: "CASH", rows: [{ craft: "Carpenter" }] },
];
const ids = [
  { ssn: "123-45-6789", itin: "" },
  { ssn: "", itin: "912345678" },
];

describe("helpers", () => {
  it("formats two decimals, guesses plan categories, reads periods, normalizes numbers", () => {
    expect(dec2(850)).toBe("8.50");
    expect(dec2(5)).toBe("0.05");
    expect(guessFringeCategory("Health Carpenters Health Trust")).toBe("healthWelfare");
    expect(guessFringeCategory("Vacation/Holiday fund")).toBe("vacationHoliday");
    expect(guessFringeCategory("Pension")).toBe("pension");
    expect(guessFringeCategory("Apprenticeship training fund")).toBe("training");
    expect(guessFringeCategory("Industry promotion")).toBe("other");
    expect(periodFromLevel("3rd period, 60%")).toBe(3);
    expect(periodFromLevel("Year 12")).toBeNull();
    expect(normalizeTaxId(" 123 45 6789 ")).toBe("123456789");
    expect(normalizeTaxId("12345")).toBe("12345");
    expect(ecprFileName("100 004", "2026-07-12")).toBe("ecpr-100004-2026-07-12.xml");
  });
});

describe("buildEcpr", () => {
  it("builds the file with DIR's totals from the WH-347 payroll and the California extras", () => {
    const r = buildEcpr(payroll(), job, workers, ids);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const [ana, tom] = r.employees;
    // Ana: 40 ST x 52.50 + 1 OT x 78.75 = 2178.75, plus 2 DT x 105 = 210 on the file only.
    expect(ana?.grossThisProjectCents).toBe(217_875 + 21_000);
    expect(ana?.grossAllWorkCents).toBe(238_875);
    // Withholding 300 = 210 federal + 90 state; other 40 = 40 SDI + 0 left over.
    expect(ana?.deductions).toEqual({
      fedTax: 21_000,
      FICA: 17_000,
      stateTax: 9_000,
      SDI: 4_000,
      fundAdmin: 0,
      savings: 0,
      dues: 0,
      other: 0,
    });
    expect(ana?.totalDeductionsCents).toBe(51_000);
    expect(ana?.netCents).toBe(238_875 - 51_000);
    expect(ana?.state).toBe("CA");
    expect(ana?.ssn).toBe("123456789");
    expect(ana?.middleName).toBe("M");
    const c = ana?.classifications[0];
    expect(c?.fringe).toEqual({
      healthWelfare: 1_200,
      vacationHoliday: 0,
      pension: 900,
      training: 0,
      other: 0,
    });
    expect(c?.paidToBenefitPlan).toBe(true);
    expect(c?.paidToEmployee).toBe(false);
    expect(tom?.classifications[0]?.level).toBe("apprentice");
    expect(tom?.classifications[0]?.period).toBe(3);
    expect(tom?.itin).toBe("912345678");
    expect(tom?.ssn).toBe("");

    const xml = r.xml ?? "";
    expect(xml).toContain("<CPR:version>2.0</CPR:version>");
    expect(xml).toContain("<CPR:contractorPWCR>2000024488</CPR:contractorPWCR>");
    expect(xml).toContain("<CPR:forWeekEnding>2026-07-12</CPR:forWeekEnding>");
    expect(xml).toContain('<CPR:day id="1">\n');
    expect(xml).toContain("<CPR:date>2026-07-06</CPR:date>");
    expect(xml).toContain("<CPR:totHrsDoubletime>2.00</CPR:totHrsDoubletime>");
    // 52.50 + 12.00 + 9.00 fringe.
    expect(xml).toContain(
      "<CPR:totalHrlyPayRateStraightTime>73.50</CPR:totalHrlyPayRateStraightTime>",
    );
    expect(xml).toContain('<CPR:classification name="Drywall Installer/Lather">');
    expect(xml).toContain("<CPR:apprenticeLevel>3</CPR:apprenticeLevel>");
    expect(xml).toContain("<CPR:checkNum>CASH</CPR:checkNum>");
    expect(xml.match(/<CPR:day id=/g)).toHaveLength(14);
    // The WH-347's "full SSN in ID no." error does not apply to this file.
    expect(r.issues.some((i) => i.message.includes("full Social Security"))).toBe(false);
  });

  it("escapes text and strips HTML from notes", () => {
    const p = payroll({ businessName: "Smith & Sons <Drywall>" });
    const w = [{ ...workers[0], notes: "<b>Foreman</b> & lead" }, workers[1]];
    const xml = buildEcpr(p, job, w, ids).xml ?? "";
    expect(xml).toContain(
      "<CPR:contractorName>Smith &amp; Sons &lt;Drywall&gt;</CPR:contractorName>",
    );
    expect(xml).toContain("<CPR:notes>Foreman &amp; lead</CPR:notes>");
  });

  it("leaves no tag in notes when one is nested inside another", () => {
    const w = [{ ...workers[0], notes: "<<b>script>x" }, workers[1]];
    const xml = buildEcpr(payroll(), job, w, ids).xml ?? "";
    expect(xml).toContain("<CPR:notes>scriptx</CPR:notes>");
  });

  it("refuses what DIR's upload rejects", () => {
    const errors = (r: ReturnType<typeof buildEcpr>) =>
      r.issues.filter((i) => i.level === "error").map((i) => i.message);
    const bad = buildEcpr(
      payroll(),
      { pwcr: "12345", projectId: "P-12" },
      [{ street: "", city: "", state: "California", zip: "958" }, { ...address }],
      [
        { ssn: "123-45-6789", itin: "" },
        { ssn: "123456789", itin: "" },
      ],
    );
    expect(bad.xml).toBeNull();
    const e = errors(bad);
    expect(e.some((m) => m.includes("PWCR"))).toBe(true);
    expect(e.some((m) => m.includes("DIR project ID"))).toBe(true);
    expect(e.some((m) => m.includes("street address"))).toBe(true);
    expect(e.some((m) => m.includes("two letters"))).toBe(true);
    expect(e.some((m) => m.includes("ZIP"))).toBe(true);
    expect(e.some((m) => m.includes("check or transaction number"))).toBe(true);
    expect(e.some((m) => m.includes("craft"))).toBe(true);
    expect(e.some((m) => m.includes("Same SSN as worker 1"))).toBe(true);

    const noId = buildEcpr(payroll(), job, workers, [ids[0], { ssn: "", itin: "" }]);
    expect(errors(noId).some((m) => m.includes("SSN, or the ITIN"))).toBe(true);

    const split = buildEcpr(
      payroll(),
      job,
      [{ ...workers[0], stateTaxCents: 40_000, duesCents: 9_000 }, workers[1]],
      ids,
    );
    expect(errors(split).some((m) => m.includes("withholding tax"))).toBe(true);
    expect(errors(split).some((m) => m.includes("other deductions"))).toBe(true);

    const noPeriod = payroll();
    const tom = noPeriod.workers[1];
    if (tom?.rows[0]) tom.rows[0].apprenticeLevel = "";
    expect(errors(buildEcpr(noPeriod, job, workers, ids)).some((m) => m.includes("period"))).toBe(
      true,
    );

    const dtNoRate = [
      { ...workers[0], rows: [{ craft: "Carpenter", dt: [0, 0, 0, 0, 0, 100, 0] }] },
      workers[1],
    ];
    expect(
      errors(buildEcpr(payroll(), job, dtNoRate, ids)).some((m) => m.includes("doubletime rate")),
    ).toBe(true);

    const long = buildEcpr(payroll({ businessName: "x".repeat(57) }), job, workers, ids);
    expect(errors(long).some((m) => m.includes("56 characters"))).toBe(true);
  });

  it("needs fringe paid somewhere, or the box saying the whole rate is wages", () => {
    const p = payroll();
    for (const w of p.workers) w.fringeCreditsCents = [];
    const r = buildEcpr(p, job, workers, ids);
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("No fringe"))).toBe(true);
    const ok = buildEcpr(p, { ...job, noFringeIsPaidToEmployee: true }, workers, ids);
    expect(ok.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(ok.employees[0]?.classifications[0]?.paidToEmployee).toBe(true);
  });

  it("puts cash in lieu under other, paid to the employee", () => {
    const p = payroll();
    const row = p.workers[0]?.rows[0];
    if (row) row.cashInLieuHourlyCents = 300;
    const c = buildEcpr(p, job, workers, ids).employees[0]?.classifications[0];
    expect(c?.fringe.other).toBe(300);
    expect(c?.paidToEmployee).toBe(true);
    expect(c?.paidToBenefitPlan).toBe(true);
  });

  it("a plan's category can be set by hand", () => {
    const r = buildEcpr(payroll(), { ...job, planCategories: [null, "training"] }, workers, ids);
    expect(r.employees[0]?.classifications[0]?.fringe.training).toBe(900);
    expect(r.employees[0]?.classifications[0]?.fringe.pension).toBe(0);
  });

  it("files a statement of non-performance with no employees", () => {
    const p = payroll({ workers: [] });
    const none = buildEcpr(p, job, [], []);
    expect(none.issues.some((i) => i.message.includes("No hours this week"))).toBe(true);
    const np = buildEcpr(p, { ...job, nonPerformance: true }, [], []);
    expect(np.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(np.xml).toContain("<CPR:statementOfNP>true</CPR:statementOfNP>");
    expect(np.xml).not.toContain("<CPR:employees>");
  });

  it("next week keeps addresses, crafts and rates and clears the week's amounts", () => {
    const n = ecprNextWeek(workers[0] ?? {});
    expect(n.street).toBe("100 Common Street");
    expect(n.checkNum).toBe("");
    expect(n.stateTaxCents).toBe(0);
    expect(n.rows?.[0]?.craft).toBe("Carpenter");
    expect(n.rows?.[0]?.dtRateCents).toBe(10_500);
    expect(n.rows?.[0]?.dt).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  // DIR's XSD is not vendored (it is DIR's file); point ECPR_XSD at a downloaded copy of
  // https://www.dir.ca.gov/Public-Works/CPR/eCPR-v2.xsd to check the output with xmllint.
  const xsd = process.env.ECPR_XSD;
  it.skipIf(!xsd || !existsSync(xsd))("validates against DIR's eCPR V2 XSD", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecpr-"));
    const files = [
      buildEcpr(payroll(), job, workers, ids).xml,
      buildEcpr(payroll({ workers: [] }), { ...job, nonPerformance: true }, [], []).xml,
    ];
    files.forEach((xml, k) => {
      const f = join(dir, `t${k}.xml`);
      writeFileSync(f, xml ?? "");
      const out = execFileSync("xmllint", ["--noout", "--schema", xsd ?? "", f], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toBe("");
    });
  });
});
