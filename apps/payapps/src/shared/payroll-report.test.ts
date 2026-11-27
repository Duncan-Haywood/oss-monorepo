import { describe, expect, it } from "vitest";
import {
  guessPayrollColumns,
  type PayrollColumns,
  parseCsv,
  parseHours,
  parsePayrollDate,
  parsePayrollMoney,
  payrollCosts,
  payrollJobs,
  payrollReference,
  readPayrollReport,
} from "./payroll-report";

// A job-costing export laid out like the payroll services' "payroll by job" reports: title lines, a
// header, employee rows tagged with a job and a cost code, and subtotal and total lines.
const REPORT = [
  "Acme Electric LLC",
  "Payroll Details by Job,,,,,,,",
  "",
  "Check Date,Employee,Customer:Job,Cost Code,Hours,Gross Pay,Employer Taxes,Employer Contributions",
  '11/14/2026,"Ruiz, Ana",Mesa Clinic TI,1,40,"$1,600.00",122.40,80.00',
  "11/14/2026,Ben Ko,Mesa Clinic TI,1,38.5,1155.00,88.36,0",
  "11/14/2026,Ben Ko,Mesa Clinic TI,2,1.5,45.00,3.44,",
  "11/14/2026,Cy Dee,Tempe Office,1,40,1200.00,91.80,0",
  ",Total for 11/14/2026,,,120,4000.00,306.00,80.00",
  "11/21/26,Ana Ruiz,Mesa Clinic TI,2,40,1600.00,122.40,80.00",
  "Grand Total,,,,160,5600.00,428.40,160.00",
].join("\n");

const lineByItem = new Map([
  ["1", "line-1"],
  ["2", "line-2"],
]);

function read() {
  const r = readPayrollReport(REPORT);
  if (!r) throw new Error("no header");
  return r;
}

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes, line breaks in quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n"two\nlines",x')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["two\nlines", "x"],
    ]);
  });
  it("splits on tabs when the first line has one", () => {
    expect(parseCsv("Date\tGross Pay\n1/2/2026\t1,200.00")).toEqual([
      ["Date", "Gross Pay"],
      ["1/2/2026", "1,200.00"],
    ]);
  });
});

describe("reading the header", () => {
  it("finds the header under title lines and matches the columns by name", () => {
    const r = read();
    expect(r.headerRow).toBe(4);
    expect(guessPayrollColumns(r.headers)).toEqual({
      date: 0,
      employee: 1,
      job: 2,
      item: 3,
      hours: 4,
      wages: 5,
      employerTaxes: 6,
      employerBenefits: 7,
    });
  });
  it("is null when no row names a date and a wages column", () => {
    expect(readPayrollReport("Name,Phone\nAna,555")).toBeNull();
  });
  it("does not give one column to two fields", () => {
    const c = guessPayrollColumns(["Pay Date", "Employee Name", "Amount", "Department"]);
    expect(c).toMatchObject({ date: 0, employee: 1, wages: 2, job: 3, employerTaxes: null });
  });
});

describe("values", () => {
  it("reads payroll dates, money and hours, and refuses what does not read", () => {
    expect(parsePayrollDate("11/21/26")).toBe("2026-11-21");
    expect(parsePayrollDate("2026-11-14")).toBe("2026-11-14");
    expect(parsePayrollDate("11/14/2026 12:00 AM")).toBe("2026-11-14");
    expect(parsePayrollDate("2/30/2026")).toBeNull();
    expect(parsePayrollMoney("$1,600.00")).toBe(160_000);
    expect(parsePayrollMoney("(12.5)")).toBe(-1_250);
    expect(parsePayrollMoney("")).toBe(0);
    expect(parsePayrollMoney("12.345")).toBeNull();
    expect(parseHours("38.5")).toBe(3_850);
    expect(parseHours("7.25")).toBe(725);
    expect(parseHours("eight")).toBeNull();
  });
});

describe("payrollJobs", () => {
  it("lists the jobs by gross pay, leaving out totals", () => {
    const r = read();
    expect(payrollJobs(r, guessPayrollColumns(r.headers))).toEqual([
      { value: "Mesa Clinic TI", rows: 4, wagesCents: 440_000 },
      { value: "Tempe Office", rows: 1, wagesCents: 120_000 },
    ]);
  });
});

describe("payrollCosts", () => {
  it("adds one labor cost per date and line: wages + employer taxes + contributions + burden", () => {
    const r = read();
    const out = payrollCosts(r, {
      columns: guessPayrollColumns(r.headers),
      jobValues: ["Mesa Clinic TI"],
      burdenBps: 1_000,
      lineByItem,
      defaultLine: null,
    });
    expect(out.errors).toEqual([]);
    expect(out.unknownItems).toEqual([]);
    expect(out.otherJobRows).toBe(1);
    expect(out.skippedRows).toBe(2);
    expect(
      out.costs.map((c) => [c.incurredOn, c.sovLineId, c.amountCents, c.reference, c.description]),
    ).toEqual([
      // 1600 + 1155 wages, 122.40 + 88.36 taxes, 80 contributions, 10% of 2755 = 275.50 burden
      [
        "2026-11-14",
        "line-1",
        275_500 + 21_076 + 8_000 + 27_550,
        "Payroll 2026-11-14 item 1",
        "Payroll report: 2 employees, 78.5 h, burden 10% of wages",
      ],
      [
        "2026-11-14",
        "line-2",
        4_500 + 344 + 450,
        "Payroll 2026-11-14 item 2",
        "Payroll report: 1 employee, 1.5 h, burden 10% of wages",
      ],
      [
        "2026-11-21",
        "line-2",
        160_000 + 12_240 + 8_000 + 16_000,
        "Payroll 2026-11-21 item 2",
        "Payroll report: 1 employee, 40 h, burden 10% of wages",
      ],
    ]);
  });

  it("with no item column, puts every row on the picked line (or none) and counts no burden", () => {
    const r = read();
    const columns: PayrollColumns = { ...guessPayrollColumns(r.headers), item: null };
    const onLine = payrollCosts(r, {
      columns,
      jobValues: ["Mesa Clinic TI"],
      burdenBps: null,
      lineByItem,
      defaultLine: { sovLineId: "line-1", itemNumber: "1" },
    });
    expect(
      onLine.costs.map((c) => [c.incurredOn, c.sovLineId, c.amountCents, c.reference]),
    ).toEqual([
      ["2026-11-14", "line-1", 280_000 + 21_420 + 8_000, "Payroll 2026-11-14 line 1"],
      ["2026-11-21", "line-1", 160_000 + 12_240 + 8_000, "Payroll 2026-11-21 line 1"],
    ]);
    const noLine = payrollCosts(r, {
      columns,
      jobValues: null,
      burdenBps: null,
      lineByItem,
      defaultLine: null,
    });
    expect(noLine.otherJobRows).toBe(0);
    expect(noLine.costs.map((c) => [c.sovLineId, c.amountCents, c.reference])).toEqual([
      [null, 400_000 + 30_600 + 8_000, "Payroll 2026-11-14"],
      [null, 160_000 + 12_240 + 8_000, "Payroll 2026-11-21"],
    ]);
  });

  it("names rows that do not read, and item numbers that are not lines, instead of guessing", () => {
    const r = readPayrollReport(
      [
        "Date,Employee,Cost Code,Gross Pay",
        "13/01/2026,Ana,1,100.00",
        "1/2/2026,Ana,1,one hundred",
        "1/2/2026,Ben,9,100.00",
        "1/2/2026,Cy,1,0",
      ].join("\n"),
    );
    if (!r) throw new Error("no header");
    const out = payrollCosts(r, {
      columns: guessPayrollColumns(r.headers),
      jobValues: null,
      burdenBps: null,
      lineByItem,
      defaultLine: null,
    });
    expect(out.errors).toEqual([
      { row: 2, message: '"13/01/2026" is not a date (use YYYY-MM-DD or M/D/YYYY)' },
      { row: 3, message: '"one hundred" in gross wages is not an amount' },
    ]);
    expect(out.unknownItems).toEqual(["9"]);
    expect(out.skippedRows).toBe(1);
    expect(out.costs).toEqual([]);
  });

  it("asks for the date and wages columns when they are not picked", () => {
    const r = read();
    const out = payrollCosts(r, {
      columns: { ...guessPayrollColumns(r.headers), wages: null },
      jobValues: null,
      burdenBps: null,
      lineByItem,
      defaultLine: null,
    });
    expect(out.errors).toEqual([{ row: 4, message: "Pick the date and gross wages columns" }]);
  });

  it("keeps references within the 100 characters a cost reference holds", () => {
    expect(
      payrollReference("2026-11-14", { itemNumber: "x".repeat(200), from: "item" }),
    ).toHaveLength(100);
  });
});
