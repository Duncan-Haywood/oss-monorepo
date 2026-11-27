import { describe, expect, it } from "vitest";
import {
  fillFromTimesheet,
  guessTimesheetColumns,
  payKind,
  readTimesheetReport,
  splitName,
  type TimesheetReport,
  timesheetHours,
} from "./certified-payroll-import";

// Week ending Saturday 2026-11-21: Sun 11/15 .. Sat 11/21.
const WEEK = "2026-11-21";

function read(csv: string): TimesheetReport {
  const r = readTimesheetReport(csv);
  if (!r) throw new Error("no header");
  return r;
}

function hours(csv: string, jobValues: string[] | null = null) {
  const r = read(csv);
  return timesheetHours(r, {
    columns: guessTimesheetColumns(r.headers),
    weekEnding: WEEK,
    jobValues,
  });
}

const row = (classification = "") => ({
  classification,
  st: [0, 0, 0, 0, 0, 0, 0],
  ot: [0, 0, 0, 0, 0, 0, 0],
  grossProjectCents: null as number | null,
  stRateCents: 0,
});
const worker = (lastName = "", firstName = "", rows = [row()]) => ({
  lastName,
  firstName,
  middleInitial: "",
  idNo: "",
  rows,
});

describe("reading a time report into WH-347 hours", () => {
  it("finds the header under title lines and puts each day's hours on its day", () => {
    const res = hours(
      [
        "Mile High Electric LLC",
        "Time Activities by Employee Detail",
        "",
        "Work Date,Employee,Customer,Hours",
        '11/16/2026,"Lopez, Ana M.",VA Clinic,8',
        '11/17/2026,"Lopez, Ana M.",VA Clinic,8.5',
        '11/17/2026,"Lopez, Ana M.",Library,2',
        "11/18/2026,Ben Ortiz,VA Clinic,7.25",
        "11/10/2026,Ben Ortiz,VA Clinic,8",
        "Total,,,33.75",
      ].join("\n"),
      ["VA Clinic"],
    );
    expect(res.errors).toEqual([]);
    expect(res.otherJobRows).toBe(1);
    expect(res.outsideWeek).toBe(1);
    expect(res.skippedRows).toBe(1);
    expect(res.entries).toHaveLength(2);
    const ana = res.entries.find((e) => e.lastName === "Lopez");
    expect(ana).toMatchObject({ firstName: "Ana", mi: "M" });
    expect(ana?.st).toEqual([0, 800, 850, 0, 0, 0, 0]);
    expect(res.entries.find((e) => e.lastName === "Ortiz")?.st).toEqual([0, 0, 0, 725, 0, 0, 0]);
    expect(res.oneDateOnly).toBe(false);
  });

  it("refuses a report dated by pay period instead of the day worked", () => {
    const res = hours("Pay Date,Employee,Hours,Gross Pay\n11/21/2026,Ana Lopez,40,1680");
    expect(res.entries).toEqual([]);
    expect(res.errors[0]?.message).toMatch(/one date per pay period/);
  });

  it("flags a plain Date column whose rows all fall on one day", () => {
    const res = hours("Date,Employee,Hours\n11/21/2026,Ana Lopez,10\n11/21/2026,Ben Ortiz,9");
    expect(res.oneDateOnly).toBe(true);
  });

  it("splits overtime out of total hours, or reads it from a pay type", () => {
    const total = hours("Date,Employee,Total Hours,OT Hours\n2026-11-16,Ana Lopez,10,2");
    expect(total.entries[0]?.st[1]).toBe(800);
    expect(total.entries[0]?.ot[1]).toBe(200);

    const regular = hours("Date,Employee,Regular Hours,Overtime Hours\n2026-11-16,Ana Lopez,8,2");
    expect(regular.entries[0]?.st[1]).toBe(800);
    expect(regular.entries[0]?.ot[1]).toBe(200);

    const typed = hours(
      [
        "Date,Employee,Pay Type,Hours",
        "2026-11-16,Ana Lopez,Regular Pay,8",
        "2026-11-16,Ana Lopez,Overtime (1.5x),2",
        "2026-11-17,Ana Lopez,Holiday,8",
        "2026-11-18,Ana Lopez,PTO,8",
      ].join("\n"),
    );
    expect(typed.entries[0]?.st).toEqual([0, 800, 0, 0, 0, 0, 0]);
    expect(typed.entries[0]?.ot).toEqual([0, 200, 0, 0, 0, 0, 0]);
    expect(typed.notWorked).toEqual({ rows: 2, types: ["Holiday", "PTO"] });
  });

  it("keeps a worker's classifications apart and reads split name columns", () => {
    const res = hours(
      [
        "Date,Last Name,First Name,Trade,Hours",
        "2026-11-16,Lopez,Ana M.,Electrician,6",
        "2026-11-16,Lopez,Ana M.,Laborer,2",
      ].join("\n"),
    );
    expect(res.entries.map((e) => [e.classification, e.st[1], e.firstName, e.mi])).toEqual([
      ["Electrician", 600, "Ana", "M"],
      ["Laborer", 200, "Ana", "M"],
    ]);
  });

  it("lists rows that do not read and days over 24 hours, never guessing", () => {
    const res = hours(
      [
        "Date,Employee,Total Hours,OT Hours",
        "2026-11-16,Ana Lopez,eight,",
        "Nov 16,Ana Lopez,8,",
        "2026-11-17,Ana Lopez,2,3",
        "2026-11-18,Ben Ortiz,14,",
        "2026-11-18,Ben Ortiz,12,",
      ].join("\n"),
    );
    const msgs = res.errors.map((e) => `${e.row}: ${e.message}`);
    expect(msgs).toContainEqual(expect.stringMatching(/^2: "eight" is not a number of hours/));
    expect(msgs).toContainEqual(expect.stringMatching(/^3: "Nov 16" is not a date/));
    expect(msgs).toContainEqual(expect.stringMatching(/^4: Overtime hours .* more than the total/));
    expect(msgs).toContainEqual(expect.stringMatching(/Ben Ortiz has 26 hours on 2026-11-18/));
  });

  it("needs an employee and hours column to find the header", () => {
    expect(readTimesheetReport("Date,Amount\n2026-11-16,100")).toBeNull();
  });
});

describe("double time", () => {
  it("is left out of the overtime row and listed per worker", () => {
    const res = hours(
      [
        "Work Date,Employee,Pay Type,Hours",
        "11/16/2026,Ana Lopez,Regular,8",
        "11/16/2026,Ana Lopez,Overtime,2",
        "11/16/2026,Ana Lopez,Double Time,1.5",
        "11/17/2026,Ana Lopez,DT,1",
      ].join("\n"),
    );
    expect(res.errors).toEqual([]);
    const ana = res.entries.find((e) => e.lastName === "Lopez");
    expect(ana?.st).toEqual([0, 800, 0, 0, 0, 0, 0]);
    expect(ana?.ot).toEqual([0, 200, 0, 0, 0, 0, 0]);
    expect(res.doubleTime).toEqual([{ name: "Ana Lopez", hundredths: 250 }]);
  });
});

describe("names and pay types", () => {
  it("splits the common name layouts", () => {
    expect(splitName("Lopez, Ana M.")).toEqual({ lastName: "Lopez", firstName: "Ana", mi: "M" });
    expect(splitName("Ana M Lopez")).toEqual({ lastName: "Lopez", firstName: "Ana", mi: "M" });
    expect(splitName("Mary Ann Lopez")).toEqual({
      lastName: "Lopez",
      firstName: "Mary Ann",
      mi: "",
    });
    expect(splitName("Lopez")).toEqual({ lastName: "Lopez", firstName: "", mi: "" });
  });

  it("reads pay types as straight time, overtime or not worked", () => {
    expect(payKind("")).toBe("st");
    expect(payKind("Regular")).toBe("st");
    expect(payKind("Hourly")).toBe("st");
    expect(payKind("OT")).toBe("ot");
    expect(payKind("Double Time")).toBe("dt");
    expect(payKind("DT")).toBe("dt");
    expect(payKind("2x")).toBe("dt");
    expect(payKind("Overtime 1.5x")).toBe("ot");
    expect(payKind("Time and a half")).toBe("ot");
    expect(payKind("Vacation")).toBe("skip");
    expect(payKind("Sick")).toBe("skip");
  });
});

describe("filling the form", () => {
  const entry = (lastName: string, firstName: string, classification: string, day: number) => {
    const st = [0, 0, 0, 0, 0, 0, 0];
    st[day] = 800;
    return {
      lastName,
      firstName,
      mi: "",
      classification,
      st,
      ot: [0, 0, 0, 0, 0, 0, 0],
      rows: 1,
    };
  };
  const make = { worker: () => worker(), row: () => row() };

  it("matches last week's crew by name, replaces their hours and keeps rates", () => {
    const ana = worker("Lopez", "Ana", [
      { ...row("Electrician"), st: [0, 8, 8, 8, 8, 8, 0].map((h) => h * 100), stRateCents: 4200 },
    ]);
    const anaRow = ana.rows[0];
    if (anaRow) anaRow.grossProjectCents = 168_000;
    const cy = worker("Ng", "Cy", [row("Laborer")]);
    const { workers, summary } = fillFromTimesheet(
      [ana, cy],
      [entry("LOPEZ", "ana", "electrician", 1), entry("Ortiz", "Ben", "", 2)],
      make,
    );
    expect(summary).toEqual({ matched: 1, added: 1, rowsAdded: 0, noHours: ["Cy Ng"] });
    expect(workers[0]?.rows[0]).toMatchObject({
      classification: "Electrician",
      stRateCents: 4200,
      st: [0, 800, 0, 0, 0, 0, 0],
      grossProjectCents: null,
    });
    expect(workers[1]?.rows[0]?.st).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(workers[2]).toMatchObject({ lastName: "Ortiz", firstName: "Ben" });
    expect(workers[2]?.rows[0]?.st[2]).toBe(800);
  });

  it("drops the empty starter worker and adds a row for a new classification", () => {
    const ana = worker("Lopez", "Ana", [row("Electrician")]);
    const { workers, summary } = fillFromTimesheet(
      [worker(), ana],
      [entry("Lopez", "Ana", "Electrician", 1), entry("Lopez", "Ana", "Laborer", 2)],
      make,
    );
    expect(workers).toHaveLength(1);
    expect(workers[0]?.rows.map((r) => [r.classification, r.st[1], r.st[2]])).toEqual([
      ["Electrician", 800, 0],
      ["Laborer", 0, 800],
    ]);
    expect(summary.rowsAdded).toBe(1);
  });

  it("names the classification on a new worker's row from the report", () => {
    const { workers } = fillFromTimesheet([], [entry("Ortiz", "Ben", "Laborer", 3)], make);
    expect(workers[0]?.rows[0]).toMatchObject({ classification: "Laborer" });
  });
});
