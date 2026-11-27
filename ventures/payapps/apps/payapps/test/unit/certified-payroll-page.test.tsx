// @vitest-environment happy-dom
import { certifiedPayrollSchema, weekDays } from "@shared/certified-payroll";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaEcprSection } from "../../src/client/components/ca-ecpr-section";
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
});
