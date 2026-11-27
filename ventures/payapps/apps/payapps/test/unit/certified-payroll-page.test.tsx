// @vitest-environment happy-dom
import { certifiedPayrollSchema, weekDays } from "@shared/certified-payroll";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaEcprSection } from "../../src/client/components/ca-ecpr-section";
import { IlCtpSection } from "../../src/client/components/il-ctp-section";
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

  it("carries the Illinois extras into next week, and never posts them with the PDF", () => {
    const w = blankWorker();
    w.lastName = "Doe";
    w.firstName = "John";
    if (w.rows[0]) w.rows[0].classification = "Carpenter";
    const il = {
      address: "900 S Spring St",
      city: "Springfield",
      state: "IL",
      zip: "62704",
      otherHours: [0, 0, 0, 0, 0, 0, 800],
      rows: [{ classType: "BLD" as const }],
    };
    const next = nextWeek({
      projectName: "Capitol Complex",
      payrollNo: "4",
      businessName: "Sangamon Drywall",
      businessAddress: "Springfield",
      projectLocation: "Sangamon County, IL",
      wageDeterminations: "IDOL Sangamon County",
      weekEnding: "2026-08-01",
      workers: [{ ...w, il }],
      il: { on: true, publicBodyName: "Capital Development Board" },
    });
    const nw = next.workers[0];
    expect(nw?.il?.address).toBe("900 S Spring St");
    expect(nw?.il?.rows?.[0]?.classType).toBe("BLD");
    expect(nw?.il?.otherHours).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(next.il?.publicBodyName).toBe("Capital Development Board");
    const parsed = certifiedPayrollSchema.parse(next);
    expect(JSON.stringify(parsed)).not.toContain("Spring St");
    expect(Object.keys(parsed)).not.toContain("il");
  });

  it("the Illinois section offers the download only once IDOL's fields are complete", () => {
    const payroll = certifiedPayrollSchema.parse({
      projectName: "Capitol Complex",
      projectNumber: "PP-555",
      payrollNo: "4",
      businessName: "Sangamon Drywall",
      businessAddress: "Springfield",
      projectLocation: "Sangamon County, IL",
      wageDeterminations: "IDOL Sangamon County",
      weekEnding: "2026-08-01",
      workers: [
        {
          lastName: "Doe",
          firstName: "John",
          idNo: "1234",
          rows: [
            {
              classification: "Carpenter",
              status: "J",
              st: [0, 800, 800, 800, 800, 800, 0],
              ot: [0, 0, 0, 0, 0, 0, 0],
              stRateCents: 5_000,
              otRateCents: 7_500,
            },
          ],
        },
      ],
    });
    const addr = { address: "900 S Spring St", city: "Springfield", state: "IL", zip: "62704" };
    const worker = {
      uid: "w1",
      lastName: "Doe",
      firstName: "John",
      idNo: "1234",
      rows: [{ classification: "Carpenter", status: "J" as const }],
      il: addr,
    };
    const props = {
      job: {
        on: true,
        project: { ...addr, county: "Sangamon" },
        contactFirstName: "Pat",
        contactLastName: "Owner",
        contractor: addr,
        phone1: "217-555-0100",
        email1: "office@example.com",
        publicBodyName: "Capital Development Board",
        publicBody: addr,
      },
      onJob: () => {},
      workers: [worker],
      onWorker: () => {},
      plans: [],
      days: weekDays("2026-08-01"),
      payroll,
      onId: () => {},
    };
    const { rerender } = render(<IlCtpSection {...props} ids={{}} />);
    const button = () => screen.getByRole("button", { name: "Download IDOL CSV" });
    expect(button()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Enter race, ethnicity, gender and veteran status/)).toBeTruthy();
    rerender(
      <IlCtpSection
        {...props}
        ids={{ w1: { race: "White", ethnicity: "Not Hispanic", gender: "M", veteran: false } }}
      />,
    );
    expect(button()).toHaveProperty("disabled", false);
  });
});
