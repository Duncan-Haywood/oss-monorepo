import { describe, expect, it } from "vitest";
import {
  certifiedPayrollFileName,
  certifiedPayrollSchema,
  computeCertifiedPayroll,
  formatHours,
  hasErrors,
  looksLikeFullSsn,
  parseHours,
  payFor,
  STATEMENT_OF_COMPLIANCE,
  weekDays,
} from "./certified-payroll";

const base = {
  projectName: "VA Clinic Electrical",
  payrollNo: "1",
  businessName: "Mile High Electric LLC",
  businessAddress: "200 Main St, Denver CO",
  projectLocation: "Denver County, CO",
  wageDeterminations: "CO20250012 Mod 3",
  weekEnding: "2026-11-21",
};
const row = (over: Record<string, unknown> = {}) => ({
  classification: "Electrician",
  status: "J" as const,
  st: [0, 800, 800, 800, 800, 800, 0],
  ot: [0, 0, 0, 0, 0, 0, 0],
  stRateCents: 4_200,
  otRateCents: 6_300,
  ...over,
});
const worker = (over: Record<string, unknown> = {}) => ({
  lastName: "Lopez",
  firstName: "Ana",
  idNo: "4821",
  rows: [row()],
  ...over,
});
const compute = (input: Record<string, unknown>) =>
  computeCertifiedPayroll(certifiedPayrollSchema.parse({ ...base, ...input }));

describe("week and hours helpers", () => {
  it("the seven days end on the week-ending date, with the form's letters", () => {
    const d = weekDays("2026-11-21"); // a Saturday
    expect(d.map((x) => x.letter).join("")).toBe("SMTWTFS");
    expect(d[0]).toEqual({ iso: "2026-11-15", letter: "S", label: "11/15" });
    expect(d[6]?.label).toBe("11/21");
    // A Tuesday-to-Monday week (DOL's own example ends on a Monday).
    expect(
      weekDays("2025-06-23")
        .map((x) => x.letter)
        .join(""),
    ).toBe("TWTFSSM");
    expect(weekDays("2026-02-30")).toEqual([]);
  });

  it("parses and prints hours in hundredths", () => {
    expect(parseHours("8.5")).toBe(850);
    expect(parseHours("8.25")).toBe(825);
    expect(parseHours("")).toBe(0);
    expect(parseHours("8.125")).toBeNull();
    expect(parseHours("x")).toBeNull();
    expect(formatHours(850)).toBe("8.5");
    expect(formatHours(800)).toBe("8");
    expect(formatHours(825)).toBe("8.25");
  });

  it("pays hundredths of an hour at a rate, rounded to the cent", () => {
    expect(payFor(4000, 4_200)).toBe(168_000);
    expect(payFor(825, 3_333)).toBe(27_497); // 8.25 x 33.33 = 274.9725
  });

  it("knows a full SSN from the last four", () => {
    expect(looksLikeFullSsn("123-45-6789")).toBe(true);
    expect(looksLikeFullSsn("123456789")).toBe(true);
    expect(looksLikeFullSsn("6789")).toBe(false);
    expect(looksLikeFullSsn("EMP-0042")).toBe(false);
  });
});

describe("computeCertifiedPayroll", () => {
  it("works hours, fringe credit, gross, deductions and net", () => {
    const p = compute({
      workers: [
        worker({
          rows: [row({ ot: [0, 0, 0, 0, 0, 200, 0] })],
          taxCents: 22_000,
          ficaCents: 17_000,
          fringeCreditsCents: [1_850, 300],
        }),
      ],
      fringePlans: [
        { name: "H&W", funded: true },
        { name: "Pension", funded: true },
      ],
    });
    const r = p.rows[0];
    expect(r?.stTotal).toBe(4000);
    expect(r?.otTotal).toBe(200);
    // 40 x 42.00 + 2 x 63.00 = 1,806.00
    expect(r?.grossProjectCents).toBe(180_600);
    expect(r?.grossProjectComputed).toBe(true);
    // (18.50 + 3.00) x 42 h = 903.00
    expect(r?.fringeCreditCents).toBe(90_300);
    const w = p.workers[0];
    expect(w?.hourlyFringeCreditCents).toBe(2_150);
    expect(w?.grossAllWorkCents).toBe(180_600);
    expect(w?.totalDeductionsCents).toBe(39_000);
    expect(w?.netCents).toBe(141_600);
    expect(p.boxes).toEqual([true, true, true, false, true, true]);
    expect(hasErrors(p)).toBe(false);
  });

  it("adds cash in lieu to the computed gross; a typed gross wins", () => {
    const p = compute({
      workers: [worker({ rows: [row({ cashInLieuHourlyCents: 1_500 })] })],
    });
    expect(p.rows[0]?.cashInLieuCents).toBe(60_000);
    expect(p.rows[0]?.grossProjectCents).toBe(168_000 + 60_000);
    expect(p.boxes[4]).toBe(true);
    const typed = compute({
      workers: [worker({ rows: [row({ grossProjectCents: 170_000 })] })],
    });
    expect(typed.rows[0]?.grossProjectCents).toBe(170_000);
    expect(typed.rows[0]?.grossProjectComputed).toBe(false);
  });

  it("two classifications share one entry number; 7B to 9 sit on the first row", () => {
    const p = compute({
      workers: [
        worker({
          rows: [
            row({ st: [0, 800, 800, 0, 0, 0, 0] }),
            row({ classification: "Laborer", stRateCents: 2_500, st: [0, 0, 0, 800, 800, 0, 0] }),
          ],
          grossAllWorkCents: 200_000,
        }),
        worker({ lastName: "Chen", firstName: "Bo" }),
      ],
    });
    expect(p.rows.map((r) => [r.entryNo, r.first])).toEqual([
      [1, true],
      [1, false],
      [2, true],
    ]);
    expect(p.workers[0]?.grossProjectCents).toBe(67_200 + 40_000);
    expect(p.workers[0]?.netCents).toBe(200_000);
  });

  it("errors: full SSN, deductions over gross, 7B under 7A, missing rates, over 24 h, RA with no program", () => {
    const p = compute({
      workers: [
        worker({
          idNo: "123-45-6789",
          taxCents: 900_000,
          grossAllWorkCents: 1_000,
          rows: [
            row({ status: "RA", stRateCents: 0 }),
            row({ st: [0, 1700, 0, 0, 0, 0, 0], ot: [0, 0, 0, 0, 0, 100, 0], otRateCents: 0 }),
          ],
        }),
      ],
    });
    const msgs = p.issues.filter((i) => i.level === "error").map((i) => i.message);
    expect(msgs.some((m) => /full Social Security/.test(m))).toBe(true);
    expect(msgs.some((m) => /Deductions are more than gross/.test(m))).toBe(true);
    expect(msgs.some((m) => /less than gross for this project/.test(m))).toBe(true);
    expect(msgs).toContain("Enter the straight-time rate paid");
    expect(msgs).toContain("Enter the overtime rate paid");
    expect(msgs.some((m) => /More than 24 hours on 11\/16/.test(m))).toBe(true);
    expect(msgs.some((m) => /registered apprentice/.test(m))).toBe(true);
    expect(hasErrors(p)).toBe(true);
  });

  it("warnings: over 40 ST hours, OT under 1.5x, under the WD rates, unfunded plan, other deduction unnamed", () => {
    const p = compute({
      workers: [
        worker({
          otherCents: 1_000,
          fringeCreditsCents: [500],
          rows: [
            row({
              st: [0, 1000, 1000, 1000, 1000, 800, 0],
              ot: [0, 0, 0, 0, 0, 100, 0],
              otRateCents: 5_000,
              requiredBasicCents: 4_500,
              requiredFringeCents: 2_000,
            }),
          ],
        }),
      ],
      fringePlans: [{ name: "Company health", funded: false }],
    });
    const warn = p.issues.filter((i) => i.level === "warning").map((i) => i.message);
    expect(warn.some((m) => /48 straight-time hours/.test(m))).toBe(true);
    expect(warn.some((m) => /under 1.5 times/.test(m))).toBe(true);
    expect(warn.some((m) => /under the wage determination's basic rate/.test(m))).toBe(true);
    expect(warn.some((m) => /under the wage determination's fringe/.test(m))).toBe(true);
    expect(warn.some((m) => /29 CFR 5.28/.test(m))).toBe(true);
    expect(warn.some((m) => /other deduction/.test(m))).toBe(true);
    expect(hasErrors(p)).toBe(false);
  });

  it("a basic rate over the WD's covers the fringe gap (cash wage satisfies fringe)", () => {
    const p = compute({
      workers: [
        worker({
          rows: [
            row({ stRateCents: 6_500, requiredBasicCents: 4_500, requiredFringeCents: 2_000 }),
          ],
        }),
      ],
    });
    expect(p.issues.some((i) => /fringe typed/.test(i.message))).toBe(false);
  });

  it("box 4 follows apprentices; box 5 can be set by hand", () => {
    const p = compute({
      workers: [worker({ rows: [row({ status: "RA", apprenticeLevel: "2nd year 60%" })] })],
      apprenticeships: [{ program: "IBEW/NECA JATC", registeredWith: "OA" }],
      fringeBox: true,
    });
    expect(p.boxes[3]).toBe(true);
    expect(p.boxes[4]).toBe(true);
    expect(hasErrors(p)).toBe(false);
  });

  it("the schema refuses more programs or plans than the form has room for", () => {
    const four = Array.from({ length: 4 }, () => ({ program: "X", registeredWith: "OA" }));
    expect(certifiedPayrollSchema.safeParse({ ...base, apprenticeships: four }).success).toBe(
      false,
    );
    const seven = Array.from({ length: 7 }, () => ({ name: "P" }));
    expect(certifiedPayrollSchema.safeParse({ ...base, fringePlans: seven }).success).toBe(false);
  });

  it("names the file for the payroll and week", () => {
    expect(
      certifiedPayrollFileName(certifiedPayrollSchema.parse({ ...base, payrollNo: "12" })),
    ).toBe("certified-payroll-12-2026-11-21.pdf");
  });

  it("keeps the form's six statements word for word", () => {
    expect(STATEMENT_OF_COMPLIANCE).toHaveLength(6);
    expect(STATEMENT_OF_COMPLIANCE[5]).toBe(
      "All workers on the project have been paid the full weekly wages earned, and no rebates or deductions have been or will be made either directly or indirectly, other than permissible deductions as defined in 29 CFR part 3.",
    );
  });
});
