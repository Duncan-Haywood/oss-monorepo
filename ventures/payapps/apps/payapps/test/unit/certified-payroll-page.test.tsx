// @vitest-environment happy-dom
import { certifiedPayrollSchema, weekDays } from "@shared/certified-payroll";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaEcprSection } from "../../src/client/components/ca-ecpr-section";
import { NjMw562Section } from "../../src/client/components/nj-mw562-section";
import { NyCprSection } from "../../src/client/components/ny-cpr-section";
import { WaCprSection } from "../../src/client/components/wa-cpr-section";
import { blankWorker, lastSaturday, nextWeek } from "../../src/client/pages/certified-payroll";

describe("certified payroll page helpers", () => {
  it("defaults the week to the Saturday on or before today", () => {
    expect(lastSaturday(new Date(2026, 10, 26))).toBe("2026-11-21"); // a Thursday
    expect(lastSaturday(new Date(2026, 10, 21))).toBe("2026-11-21"); // that Saturday
    expect(lastSaturday(new Date(2026, 10, 22))).toBe("2026-11-21"); // the Sunday after
  });

  it("starts next week from this week's crew with hours and deductions cleared", () => {
    const w = blankWorker();
    w.lastName = "Lopez";
    w.firstName = "Ana";
    w.taxCents = 22_000;
    w.otherNote = "dues";
    const row = w.rows[0];
    if (!row) throw new Error("no row");
    row.classification = "Electrician";
    row.st = [0, 800, 800, 800, 800, 800, 0];
    row.stRateCents = 4_200;
    row.grossProjectCents = 170_000;
    const next = nextWeek({
      projectName: "VA Clinic",
      payrollNo: "3",
      businessName: "Mile High Electric LLC",
      businessAddress: "Denver",
      projectLocation: "Denver County, CO",
      wageDeterminations: "CO20250012",
      weekEnding: "2026-11-21",
      final: true,
      remarks: "snow",
      workers: [w],
    });
    expect(next.payrollNo).toBe("4");
    expect(next.weekEnding).toBe("2026-11-28");
    expect(next.final).toBe(false);
    expect(next.remarks).toBe("");
    const nw = next.workers[0];
    expect(nw?.lastName).toBe("Lopez");
    expect(nw?.taxCents).toBe(0);
    expect(nw?.rows[0]?.classification).toBe("Electrician");
    expect(nw?.rows[0]?.stRateCents).toBe(4_200);
    expect(nw?.rows[0]?.st).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(nw?.rows[0]?.grossProjectCents).toBeNull();
    // The client-only uid is stripped by the schema the Worker validates with.
    const parsed = certifiedPayrollSchema.parse(next);
    expect(Object.keys(parsed.workers[0] ?? {})).not.toContain("uid");
  });

  it("a non-numeric payroll number is kept", () => {
    const n = nextWeek({
      projectName: "x",
      payrollNo: "A-7",
      businessName: "x",
      businessAddress: "x",
      projectLocation: "x",
      wageDeterminations: "x",
      weekEnding: "2026-12-26",
      workers: [],
    });
    expect(n.payrollNo).toBe("A-7");
    expect(n.weekEnding).toBe("2027-01-02");
  });

  it("carries the California extras into next week, and never posts them with the PDF", () => {
    const w = blankWorker();
    w.lastName = "Lopez";
    w.firstName = "Ana";
    if (w.rows[0]) w.rows[0].classification = "Drywall Installer/Lather";
    const ca = {
      street: "100 Common Street",
      city: "Sacramento",
      state: "CA",
      zip: "95814",
      checkNum: "10451",
      stateTaxCents: 9_000,
      rows: [{ craft: "Carpenter", dt: [0, 0, 0, 0, 0, 200, 0], dtRateCents: 10_500 }],
    };
    const next = nextWeek({
      projectName: "Elm School",
      payrollNo: "4",
      businessName: "Valley Drywall Inc",
      businessAddress: "Sacramento",
      projectLocation: "Sacramento County, CA",
      wageDeterminations: "SAC-2025-1",
      weekEnding: "2026-07-12",
      workers: [{ ...w, ca }],
      ca: { on: true, pwcr: "2000024488", projectId: "100004", nonPerformance: true },
    });
    const nw = next.workers[0];
    expect(nw?.ca?.street).toBe("100 Common Street");
    expect(nw?.ca?.checkNum).toBe("");
    expect(nw?.ca?.stateTaxCents).toBe(0);
    expect(nw?.ca?.rows?.[0]?.dt).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(nw?.ca?.rows?.[0]?.dtRateCents).toBe(10_500);
    expect(next.ca?.pwcr).toBe("2000024488");
    expect(next.ca?.nonPerformance).toBe(false);
    // The PDF request is the schema's output: addresses and DIR numbers are stripped from it.
    const parsed = certifiedPayrollSchema.parse(next);
    expect(JSON.stringify(parsed)).not.toContain("Common Street");
    expect(Object.keys(parsed)).not.toContain("ca");
  });

  it("the California section offers the download only once DIR's fields are complete", () => {
    const payroll = certifiedPayrollSchema.parse({
      projectName: "Elm School",
      payrollNo: "4",
      businessName: "Valley Drywall Inc",
      businessAddress: "Sacramento",
      projectLocation: "Sacramento County, CA",
      wageDeterminations: "SAC-2025-1",
      weekEnding: "2026-07-12",
      workers: [
        {
          lastName: "Lopez",
          firstName: "Ana",
          rows: [
            {
              classification: "Drywall Installer/Lather",
              status: "J",
              st: [800, 800, 800, 800, 800, 0, 0],
              ot: [0, 0, 0, 0, 0, 0, 0],
              stRateCents: 5_250,
              otRateCents: 7_875,
              cashInLieuHourlyCents: 2_100,
            },
          ],
        },
      ],
    });
    const worker = {
      uid: "w1",
      lastName: "Lopez",
      firstName: "Ana",
      rows: [{ classification: "Drywall Installer/Lather", status: "J" as const }],
      ca: {
        street: "100 Common Street",
        city: "Sacramento",
        state: "CA",
        zip: "95814",
        checkNum: "CASH",
        rows: [{ craft: "Carpenter" }],
      },
    };
    const props = {
      job: { on: true, pwcr: "2000024488", projectId: "100004" },
      onJob: () => {},
      workers: [worker],
      onWorker: () => {},
      plans: [],
      days: weekDays("2026-07-12"),
      payroll,
      onId: () => {},
    };
    const { rerender } = render(<CaEcprSection {...props} ids={{}} />);
    const button = () => screen.getByRole("button", { name: "Download eCPR XML" });
    expect(button()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Enter the worker's SSN/)).toBeTruthy();
    rerender(<CaEcprSection {...props} ids={{ w1: { ssn: "123456789", itin: "" } }} />);
    expect(button()).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
  });
  it("carries the New York extras into next week, and never posts them with the PDF", () => {
    const w = blankWorker();
    w.lastName = "Bradley";
    w.firstName = "Steven";
    if (w.rows[0]) w.rows[0].classification = "Laborer";
    const ny = {
      address1: "124 Main St",
      city: "Albany",
      state: "NY",
      zip: "12207",
      stateTaxCents: 9_000,
      duesCents: 2_000,
      rows: [{ category: "Laborer – Building" }],
    };
    const next = nextWeek({
      projectName: "Capitol Annex",
      payrollNo: "3",
      businessName: "Hudson Electric LLC",
      businessAddress: "Albany",
      projectLocation: "Albany County, NY",
      wageDeterminations: "PRC 2026001234",
      weekEnding: "2026-08-02",
      workers: [{ ...w, ny }],
      ny: { on: true, prcNumber: "2026001234" },
    });
    const nw = next.workers[0];
    expect(nw?.ny?.address1).toBe("124 Main St");
    expect(nw?.ny?.rows?.[0]?.category).toBe("Laborer – Building");
    expect(nw?.ny?.stateTaxCents).toBe(0);
    expect(nw?.ny?.duesCents).toBe(0);
    expect(next.ny?.prcNumber).toBe("2026001234");
    const parsed = certifiedPayrollSchema.parse(next);
    expect(JSON.stringify(parsed)).not.toContain("Main St");
    expect(Object.keys(parsed)).not.toContain("ny");
  });

  it("the New York section offers the download only once NYSDOL's fields are complete", () => {
    const payroll = certifiedPayrollSchema.parse({
      projectName: "Capitol Annex",
      payrollNo: "3",
      businessName: "Hudson Electric LLC",
      businessAddress: "Albany",
      projectLocation: "Albany County, NY",
      wageDeterminations: "PRC 2026001234",
      weekEnding: "2026-08-02",
      workers: [
        {
          lastName: "Johnson",
          firstName: "Emily",
          rows: [
            {
              classification: "Laborer - Building",
              status: "J",
              st: [0, 800, 800, 800, 800, 800, 0],
              ot: [0, 0, 0, 0, 0, 0, 0],
              stRateCents: 4_000,
              otRateCents: 6_000,
            },
          ],
        },
      ],
    });
    const worker = {
      uid: "w1",
      lastName: "Johnson",
      firstName: "Emily",
      idNo: "",
      rows: [{ classification: "Laborer - Building", status: "J" as const }],
      ny: { address1: "124 Main St", city: "Albany", state: "NY", zip: "12207" },
    };
    const props = {
      job: { on: true, prcNumber: "2026001234" },
      onJob: () => {},
      workers: [worker],
      onWorker: () => {},
      plans: [],
      payroll,
      onId: () => {},
    };
    const { rerender } = render(<NyCprSection {...props} ids={{}} />);
    const button = () => screen.getByRole("button", { name: "Download NYSDOL XML" });
    expect(button()).toHaveProperty("disabled", true);
    expect(screen.getByText(/or the date of birth if none/)).toBeTruthy();
    expect(screen.getByText(/In the file as "Laborer – Building"/)).toBeTruthy();
    rerender(<NyCprSection {...props} ids={{ w1: { dob: "1990-01-31" } }} />);
    expect(button()).toHaveProperty("disabled", false);
  });

  it("carries the Washington extras into next week, clears no-work, and never posts them", () => {
    const w = blankWorker();
    w.lastName = "Ortiz";
    w.firstName = "Ana";
    if (w.rows[0]) w.rows[0].classification = "Journey Level";
    const wa = {
      address1: "88 S 9th St",
      city: "Tacoma",
      state: "WA",
      zip: "98402",
      rows: [{ trade: "ELEC" }],
    };
    const next = nextWeek({
      projectName: "Lincoln Elementary",
      payrollNo: "4",
      businessName: "Narrows Electric LLC",
      businessAddress: "Tacoma",
      projectLocation: "Pierce County, WA",
      wageDeterminations: "L&I rates",
      weekEnding: "2026-08-01",
      workers: [{ ...w, wa }],
      wa: { on: true, intentId: "1234567", county: "Pierce", noWork: true },
    });
    expect(next.workers[0]?.wa?.rows?.[0]?.trade).toBe("ELEC");
    expect(next.wa?.intentId).toBe("1234567");
    expect(next.wa?.noWork).toBe(false);
    const parsed = certifiedPayrollSchema.parse(next);
    expect(JSON.stringify(parsed)).not.toContain("88 S 9th");
    expect(Object.keys(parsed)).not.toContain("wa");
  });

  it("the Washington section offers the download once the full SSN is typed", () => {
    const payroll = certifiedPayrollSchema.parse({
      projectName: "Lincoln Elementary",
      payrollNo: "4",
      businessName: "Narrows Electric LLC",
      businessAddress: "Tacoma",
      projectLocation: "Pierce County, WA",
      wageDeterminations: "L&I rates",
      weekEnding: "2026-08-01",
      workers: [
        {
          lastName: "Ortiz",
          firstName: "Ana",
          rows: [
            {
              classification: "Journey Level",
              status: "J",
              st: [0, 800, 800, 800, 800, 800, 0],
              ot: [0, 0, 0, 0, 0, 0, 0],
              stRateCents: 6_512,
              otRateCents: 9_768,
            },
          ],
        },
      ],
    });
    const worker = {
      uid: "w1",
      lastName: "Ortiz",
      firstName: "Ana",
      rows: [{ classification: "Journey Level", status: "J" as const }],
      wa: {
        address1: "88 S 9th St",
        city: "Tacoma",
        state: "WA",
        zip: "98402",
        rows: [{ trade: "ELEC" }],
      },
    };
    const props = {
      job: { on: true, intentId: "1234567", county: "Pierce" },
      onJob: () => {},
      workers: [worker],
      onWorker: () => {},
      plans: [],
      payroll,
      onId: () => {},
    };
    const { rerender } = render(<WaCprSection {...props} ids={{}} />);
    const button = () => screen.getByRole("button", { name: "Download L&I XML" });
    expect(button()).toHaveProperty("disabled", true);
    expect(screen.getByText(/requires all 9 digits/)).toBeTruthy();
    rerender(<WaCprSection {...props} ids={{ w1: { ssn: "123-45-6789" } }} />);
    expect(button()).toHaveProperty("disabled", false);
  });
  it("carries the New Jersey extras into next week with the tax split cleared, and never posts them", () => {
    const w = blankWorker();
    w.lastName = "Rivera";
    w.firstName = "Luis";
    if (w.rows[0]) w.rows[0].classification = "Electrician";
    const nj = {
      address: "9 Oak Ave, Trenton NJ",
      sex: "M" as const,
      race: "W" as const,
      ethnicity: "H" as const,
      stateTaxCents: 2_000,
      njContribCents: 500,
    };
    const next = nextWeek({
      projectName: "Trenton Library HVAC",
      payrollNo: "2",
      businessName: "Delaware Valley Electric LLC",
      businessAddress: "Trenton",
      projectLocation: "Mercer County, NJ",
      wageDeterminations: "NJ rates",
      weekEnding: "2026-08-01",
      workers: [{ ...w, nj }],
      nj: { on: true, fein: "12-3456789", registrationNo: "PW-1" },
    });
    expect(next.workers[0]?.nj).toEqual({ ...nj, stateTaxCents: 0, njContribCents: 0 });
    expect(next.nj?.registrationNo).toBe("PW-1");
    const parsed = certifiedPayrollSchema.parse(next);
    expect(JSON.stringify(parsed)).not.toContain("Oak Ave");
    expect(Object.keys(parsed)).not.toContain("nj");
  });

  it("the New Jersey section waits for the blank MW-562 before offering the download", () => {
    const payroll = certifiedPayrollSchema.parse({
      projectName: "Trenton Library HVAC",
      payrollNo: "2",
      businessName: "Delaware Valley Electric LLC",
      businessAddress: "Trenton",
      projectLocation: "Mercer County, NJ",
      wageDeterminations: "NJ rates",
      weekEnding: "2026-08-01",
      workers: [
        {
          lastName: "Rivera",
          firstName: "Luis",
          rows: [
            {
              classification: "Electrician",
              status: "J",
              st: [0, 800, 800, 800, 800, 800, 0],
              ot: [0, 0, 0, 0, 0, 0, 0],
              stRateCents: 5_250,
              otRateCents: 7_875,
            },
          ],
          taxCents: 10_000,
        },
      ],
    });
    const props = {
      job: { on: true, fein: "12-3456789", registrationNo: "PW-1" },
      onJob: () => {},
      workers: [
        { uid: "w1", lastName: "Rivera", firstName: "Luis", nj: { stateTaxCents: 50_000 } },
      ],
      onWorker: () => {},
      plans: [],
      payroll,
    };
    render(<NjMw562Section {...props} />);
    const button = screen.getByRole("button", { name: "Download filled MW-562" });
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText(/Pick the blank form first/)).toBeTruthy();
    // The split is checked against the WH-347 withholding.
    expect(screen.getByText(/cannot be more than it/)).toBeTruthy();
    expect(screen.getByText(/Sex, race and ethnicity are blank/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /NJDOL's prevailing wage updates page/ })).toBeTruthy();
  });
});
