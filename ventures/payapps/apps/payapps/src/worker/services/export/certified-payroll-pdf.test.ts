import { certifiedPayrollSchema, computeCertifiedPayroll } from "@shared/certified-payroll";
import { describe, expect, it } from "vitest";
import { certifiedPayrollPdf, remarksText } from "./certified-payroll-pdf";

const worker = (n: number, credit = 0) => ({
  lastName: `Worker${n}`,
  firstName: "Test",
  idNo: String(1000 + n),
  rows: [
    {
      classification: "Electrician",
      status: "J",
      st: [0, 800, 800, 800, 800, 800, 0],
      ot: [0, 0, 0, 0, 0, 0, 0],
      stRateCents: 4_200,
      otRateCents: 6_300,
    },
  ],
  fringeCreditsCents: credit ? [credit] : [],
});
const input = (workers: unknown[], extra: Record<string, unknown> = {}) =>
  computeCertifiedPayroll(
    certifiedPayrollSchema.parse({
      projectName: "VA Clinic",
      payrollNo: "1",
      businessName: "Mile High Electric LLC",
      businessAddress: "Denver CO",
      projectLocation: "Denver County, CO",
      wageDeterminations: "CO20250012",
      weekEnding: "2026-11-21",
      workers,
      ...extra,
    }),
  );
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("certifiedPayrollPdf", () => {
  it("one worker: page 1 and the statement page", () => {
    const pdf = decode(certifiedPayrollPdf(input([worker(1)])));
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("/MediaBox [0 0 792 612]");
    expect(pdf).toContain("(Worker1)");
    expect(pdf).toContain("(1,680.00)");
    expect(pdf).toContain("Statement of Compliance");
    expect(pdf).toContain("SIGNATURE OF CERTIFYING OFFICIAL");
  });

  it("eight rows a page: nine workers take two pages before the statement", () => {
    const workers = Array.from({ length: 9 }, (_, i) => worker(i + 1));
    const pdf = decode(certifiedPayrollPdf(input(workers)));
    expect(pdf).toContain("/Count 3");
    expect(pdf).toContain("(Worker9)");
  });

  it("an addendum when more than eight workers claim a fringe credit", () => {
    const workers = Array.from({ length: 10 }, (_, i) => worker(i + 1, 1_000));
    const pdf = decode(
      certifiedPayrollPdf(input(workers, { fringePlans: [{ name: "H&W", funded: true }] })),
    );
    expect(pdf).toContain("Addendum to the statement of compliance");
    expect(pdf).toContain("/Count 4");
  });

  it("names other deductions under remarks; the sample mark", () => {
    const p = input([{ ...worker(1), otherCents: 2_500, otherNote: "union dues" }], {
      remarks: "Week shortened by snow.",
    });
    expect(remarksText(p)).toBe(
      "Week shortened by snow. Other deduction, entry 1 (Worker1): $25.00, union dues.",
    );
    expect(decode(certifiedPayrollPdf(p, { sample: true }))).toContain("SAMPLE JOB");
  });
});
