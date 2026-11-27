import { describe, expect, it } from "vitest";
import { certifiedPayrollSchema } from "./certified-payroll";
import {
  buildIlCtp,
  guessFringeKind,
  IL_CTP_COLUMNS,
  type IlId,
  type IlJobInput,
  type IlWorkerInput,
  ilCtpFileName,
  ilNextWeek,
  num,
  stateCode,
  usDate,
} from "./il-ctp";

// A Springfield drywall sub, the week ending Saturday 2026-08-01 (Sunday 07-26 to Saturday 08-01).
const payroll = (over: Record<string, unknown> = {}) =>
  certifiedPayrollSchema.parse({
    projectName: "Capitol Complex Renovation",
    projectNumber: "PP-555",
    payrollNo: "4",
    businessName: "Sangamon Drywall, Inc.",
    businessAddress: "100 Main St, Springfield IL",
    projectLocation: "Sangamon County, IL",
    wageDeterminations: "IDOL Sangamon County, July 2026",
    weekEnding: "2026-08-01",
    workers: [
      {
        lastName: "Doe",
        firstName: "John",
        middleInitial: "J",
        idNo: "1234",
        rows: [
          {
            classification: "Carpenter",
            status: "J",
            st: [0, 800, 800, 800, 800, 800, 0],
            ot: [0, 200, 0, 0, 0, 0, 0],
            stRateCents: 5_000,
            otRateCents: 7_500,
          },
        ],
        taxCents: 30_000,
        ficaCents: 16_000,
        fringeCreditsCents: [1_500, 1_200],
      },
      {
        lastName: "Smith",
        firstName: "James",
        idNo: "3333",
        rows: [
          {
            classification: "Carpenter",
            status: "RA",
            st: [0, 800, 800, 0, 0, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 3_000,
            otRateCents: 4_500,
          },
          {
            classification: "Laborer",
            status: "J",
            st: [0, 0, 0, 800, 800, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            stRateCents: 4_000,
            otRateCents: 6_000,
          },
        ],
        taxCents: 5_000,
        ficaCents: 4_000,
        fringeCreditsCents: [1_500, 0],
      },
    ],
    apprenticeships: [
      { program: "Carpenters JATC", registeredWith: "OA", classification: "Carpenter" },
    ],
    fringePlans: [
      { name: "Carpenters Pension Fund", type: "Pension" },
      { name: "Carpenters Health and Welfare", type: "Health" },
    ],
    certifierName: "Pat Owner",
    ...over,
  });

const address = {
  address: "900 S Spring St",
  city: "Springfield",
  state: "IL",
  zip: "62704",
};

const job = (over: Partial<IlJobInput> = {}): IlJobInput => ({
  contractNumber: "438439",
  project: { ...address, county: "Sangamon" },
  contactFirstName: "Pat",
  contactLastName: "Owner",
  contractor: { ...address, zip: "62701-1234" },
  phone1: "(217) 555-0100",
  email1: "office@example.com",
  publicBodyName: "Capital Development Board",
  publicBody: address,
  ...over,
});

const workers = (): IlWorkerInput[] => [
  { ...address, phone1: "309-555-5555" },
  {
    ...address,
    rows: [{ classification: "Carpenter", classType: "BLD", region: "N", classCode: 1 }],
  },
];

const ids: IlId[] = [
  { race: "White", ethnicity: "Not Hispanic or Latino", gender: "M", veteran: true },
  { race: "Asian", ethnicity: "Hispanic or Latino", gender: "M", veteran: false },
];

const col = (row: readonly string[], name: (typeof IL_CTP_COLUMNS)[number], nth = 0) => {
  let seen = -1;
  const i = IL_CTP_COLUMNS.findIndex((c) => c === name && ++seen === nth);
  return row[i];
};

describe("IDOL template layout", () => {
  it("has the template's 102 columns, typos and repeats kept", () => {
    expect(IL_CTP_COLUMNS).toHaveLength(102);
    expect(IL_CTP_COLUMNS[0]).toBe("PayrollStart");
    expect(IL_CTP_COLUMNS[101]).toBe("NoWorktoReport");
    expect(IL_CTP_COLUMNS).toContain("WednsdayPrevailingHoursWorked");
    expect(IL_CTP_COLUMNS).toContain("SatdayNonPrevailingHoursWorked");
    expect(IL_CTP_COLUMNS.filter((c) => c === "ContactFirstName")).toHaveLength(2);
    expect(IL_CTP_COLUMNS.filter((c) => c === "Zip4")).toHaveLength(4);
  });
});

describe("buildIlCtp", () => {
  it("builds one row per worker per classification with no errors", () => {
    const r = buildIlCtp(payroll(), job(), workers(), ids);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.rows).toHaveLength(3);
    for (const row of r.rows) expect(row).toHaveLength(102);
    expect(r.csv?.split("\r\n")[0]).toBe(IL_CTP_COLUMNS.join(","));
    expect(r.csv?.endsWith("\r\n")).toBe(true);
  });

  it("fills the project, contractor and public body blocks", () => {
    const [row] = buildIlCtp(payroll(), job(), workers(), ids).rows;
    if (!row) throw new Error("no row");
    expect(col(row, "PayrollStart")).toBe("07/26/2026");
    expect(col(row, "PayrollEnd")).toBe("08/01/2026");
    expect(col(row, "ProjectNumber")).toBe("PP-555");
    expect(col(row, "ProjectCounty")).toBe("Sangamon");
    expect(col(row, "StateCapitalFunds")).toBe("0");
    expect(col(row, "CompanyName")).toBe("Sangamon Drywall, Inc.");
    expect(col(row, "Zip5", 0)).toBe("62701");
    expect(col(row, "Zip4", 1)).toBe("1234");
    expect(col(row, "PrimaryPhone", 0)).toBe("2175550100");
    expect(col(row, "PublicBodyName")).toBe("Capital Development Board");
    expect(col(row, "Last4SSN")).toBe("1234");
    expect(col(row, "PrimaryPhone", 2)).toBe("3095555555");
    expect(col(row, "IsaVeteran")).toBe("1");
  });

  it("puts each day under its weekday and totals hours, rates and gross", () => {
    const [row] = buildIlCtp(payroll(), job(), workers(), ids).rows;
    if (!row) throw new Error("no row");
    expect(col(row, "SundayPrevailingHoursWorked")).toBe("0");
    expect(col(row, "MondayPrevailingHoursWorked")).toBe("10");
    expect(col(row, "FridayPrevailingHoursWorked")).toBe("8");
    expect(col(row, "TotalPrevailingStraightHoursWorked")).toBe("40");
    expect(col(row, "TotalPrevailingOTHoursWorked")).toBe("2");
    expect(col(row, "PrevailingHourlyWage")).toBe("50");
    expect(col(row, "PrevailingOTWage")).toBe("75");
    // 40 x 50 + 2 x 75 = 2150; net 2150 - 300 - 160.
    expect(col(row, "PrevailingGrossIncome")).toBe("2150");
    expect(col(row, "PrevailingNetIncome")).toBe("1690");
    expect(col(row, "HourlyPensionRetirement")).toBe("15");
    expect(col(row, "HourlyHealthInsuranceWelfare")).toBe("12");
    expect(col(row, "Journeyman")).toBe("1");
    expect(col(row, "Apprentice")).toBe("0");
  });

  it("maps a week ending Wednesday by weekday, not position", () => {
    const p = payroll({ weekEnding: "2026-07-29" }); // Thursday 07-23 .. Wednesday 07-29
    const [row] = buildIlCtp(p, job(), workers(), ids).rows;
    if (!row) throw new Error("no row");
    // position 1 is Friday 07-24 (10 hours); Thursday (position 0) is 0.
    expect(col(row, "FridayPrevailingHoursWorked")).toBe("10");
    expect(col(row, "ThursdayPrevailingHoursWorked")).toBe("0");
    expect(col(row, "PayrollStart")).toBe("07/23/2026");
  });

  it("splits a two-classification worker's net across rows by gross", () => {
    const r = buildIlCtp(payroll(), job(), workers(), ids);
    const [, a, b] = r.rows;
    if (!a || !b) throw new Error("rows");
    // gross 16 x 30 = 480 and 16 x 40 = 640; net 1120 - 90 = 1030.
    expect(col(a, "PrevailingGrossIncome")).toBe("480");
    expect(col(b, "PrevailingGrossIncome")).toBe("640");
    expect(Number(col(a, "PrevailingNetIncome")) + Number(col(b, "PrevailingNetIncome"))).toBe(
      1030,
    );
    expect(col(a, "Apprentice")).toBe("1");
    expect(col(a, "ClassType")).toBe("BLD");
    expect(col(a, "GeographicDivision")).toBe("N");
    expect(col(a, "ClassCode")).toBe("1");
    expect(col(b, "ClassType")).toBe("ALL");
    expect(col(b, "ClassCode")).toBe("");
  });

  it("reports other-project hours, and splits net in proportion to gross", () => {
    const p = payroll();
    const w0 = p.workers[0];
    if (!w0) throw new Error("worker");
    w0.grossAllWorkCents = 265_000;
    const ws = workers();
    ws[0] = {
      ...ws[0],
      otherHours: [0, 0, 0, 0, 0, 0, 1000],
      otherStRateCents: 5_000,
    };
    const r = buildIlCtp(p, job(), ws, ids);
    const [row] = r.rows;
    if (!row) throw new Error("row");
    expect(col(row, "SatdayNonPrevailingHoursWorked")).toBe("10");
    expect(col(row, "TotalNonPrevailingStraightHoursWorked")).toBe("10");
    expect(col(row, "NonPrevailingGrossIncome")).toBe("500");
    // net 2650 - 460 = 2190; here 2190 x 2150 / 2650 = 1776.79.
    expect(col(row, "PrevailingNetIncome")).toBe("1776.79");
    expect(col(row, "NonPrevailingNetIncome")).toBe("413.21");
    expect(r.issues.some((i) => i.message.includes("in proportion to gross"))).toBe(true);
  });

  it("asks for what the portal requires", () => {
    const r = buildIlCtp(
      payroll(),
      { project: {} },
      [{}, {}],
      [undefined, { race: "", ethnicity: "", gender: "", veteran: null }],
    );
    expect(r.csv).toBeNull();
    const msgs = r.issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`);
    expect(msgs).toContain("Project: Enter the county");
    expect(msgs).toContain("Contractor: Enter the contact person's first and last name");
    expect(msgs.some((m) => m.startsWith("Contractor: Enter the primary email"))).toBe(true);
    expect(msgs).toContain("Public body: Enter the public body's name");
    expect(msgs.some((m) => m.startsWith("Worker 1 (Doe): Enter race"))).toBe(true);
    expect(msgs).toContain("Worker 1 (Doe): Enter the street address");
  });

  it("warns that cash in lieu has no column", () => {
    const p = payroll();
    const r0 = p.workers[0]?.rows[0];
    if (!r0) throw new Error("row");
    r0.cashInLieuHourlyCents = 300;
    const r = buildIlCtp(p, job(), workers(), ids);
    expect(
      r.issues.some((i) => i.level === "warning" && i.message.includes("cash paid in lieu")),
    ).toBe(true);
  });

  it("quotes cells with commas and keeps double time out of overtime", () => {
    const ws = workers();
    ws[0] = { ...ws[0], rows: [{ dtHundredths: 200, dtRateCents: 10_000 }] };
    const r = buildIlCtp(payroll(), job(), ws, ids);
    expect(r.csv).toContain('"Sangamon Drywall, Inc."');
    const [row] = r.rows;
    if (!row) throw new Error("row");
    expect(col(row, "TotalPrevailingOTHoursWorked")).toBe("0");
    expect(col(row, "PrevailingDoubleTimeHours")).toBe("2");
    expect(col(row, "PrevailingDoubleTimeWageRate")).toBe("100");
  });
});

describe("helpers", () => {
  it("formats numbers, dates, states and names", () => {
    expect(num(800)).toBe("8");
    expect(num(5_250)).toBe("52.5");
    expect(num(5_205)).toBe("52.05");
    expect(num(0)).toBe("0");
    expect(usDate("2026-08-01")).toBe("08/01/2026");
    expect(stateCode("Illinois")).toBe("IL");
    expect(stateCode("il")).toBe("IL");
    expect(stateCode("Ill.")).toBeNull();
    expect(guessFringeKind("Annuity")).toBe("pension");
    expect(guessFringeKind("Health and welfare")).toBe("health");
    expect(guessFringeKind("Apprenticeship fund")).toBe("training");
    expect(guessFringeKind("Life insurance")).toBe("other");
    expect(ilCtpFileName("Public Project #555", "2026-08-01")).toBe(
      "il-ctp-Public-Project-555-2026-08-01.csv",
    );
    const next = ilNextWeek({
      otherHours: [0, 0, 0, 0, 0, 0, 500],
      city: "Peoria",
      rows: [{ dtHundredths: 100 }],
    });
    expect(next.city).toBe("Peoria");
    expect(next.otherHours).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(next.rows?.[0]?.dtHundredths).toBe(0);
  });
});
