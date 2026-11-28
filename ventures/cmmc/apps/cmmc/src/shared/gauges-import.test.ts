import { describe, expect, it } from "vitest";
import { gaugeListCsv } from "./calibration";
import {
  type GaugeImportRow,
  parseCalResult,
  parseGaugeKind,
  parseGaugeOwner,
  parseGaugeStatus,
  parseIntervalMonths,
  planGaugeImport,
  plannedCalibration,
  wholeMonthsBetween,
} from "./gauges-import";

const TODAY = "2026-11-28";
const NONE = { lastCalPassed: false, performerDefault: null } as const;

describe("cell readers", () => {
  it("reads the kind from labels and words", () => {
    expect(parseGaugeKind("Caliper")).toBe("caliper");
    expect(parseGaugeKind("0-6 in digital caliper")).toBe("caliper");
    expect(parseGaugeKind("Dial or test indicator")).toBe("indicator");
    expect(parseGaugeKind("1/4-20 UNC-2B thread plug gauge")).toBe("thread_gauge");
    expect(parseGaugeKind("Pin gage set .061-.250")).toBe("pin_plug_gauge");
    expect(parseGaugeKind("12 in height gage")).toBe("height_gauge");
    expect(parseGaugeKind("Gage block set grade 0")).toBe("gauge_blocks");
    expect(parseGaugeKind("0-1 in OD mic")).toBe("micrometer");
    expect(parseGaugeKind("Rockwell tester")).toBe("hardness_tester");
    expect(parseGaugeKind("Bore gauge")).toBeNull();
  });

  it("reads status, owner and result words, and nothing else", () => {
    expect(parseGaugeStatus("Active")).toBe("active");
    expect(parseGaugeStatus("In use")).toBe("active");
    expect(parseGaugeStatus("Reference only")).toBe("reference_only");
    expect(parseGaugeStatus("NCR")).toBe("reference_only");
    expect(parseGaugeStatus("Out for repair")).toBe("out_of_service");
    expect(parseGaugeStatus("Scrapped")).toBe("retired");
    expect(parseGaugeStatus("Inactive")).toBeNull();
    expect(parseGaugeOwner("Employee's own")).toBe("employee");
    expect(parseGaugeOwner("Personal")).toBe("employee");
    expect(parseGaugeOwner("Company")).toBe("company");
    expect(parseGaugeOwner("Joe")).toBeNull();
    expect(parseCalResult("Pass")).toBe("in_tolerance");
    expect(parseCalResult("OOT")).toBe("out_of_tolerance");
    expect(parseCalResult("see cert")).toBeNull();
  });

  it("reads intervals in months, years, words and the usual day counts", () => {
    expect(parseIntervalMonths("12")).toEqual({ months: 12 });
    expect(parseIntervalMonths("6 months")).toEqual({ months: 6 });
    expect(parseIntervalMonths("1 yr")).toEqual({ months: 12 });
    expect(parseIntervalMonths("Annual")).toEqual({ months: 12 });
    expect(parseIntervalMonths("Quarterly")).toEqual({ months: 3 });
    expect(parseIntervalMonths("365", "days")?.months).toBe(12);
    expect(parseIntervalMonths("365", "days")?.note).toContain("12 months");
    expect(parseIntervalMonths("100 days")).toBeNull();
    expect(parseIntervalMonths("as needed")).toBeNull();
    expect(wholeMonthsBetween("2026-01-31", "2026-07-31")).toBe(6);
    expect(wholeMonthsBetween("2026-01-15", "2026-07-20")).toBeNull();
  });
});

describe("planGaugeImport", () => {
  const LIST = [
    "Acme Machine gauge list,,,,,,,,",
    "Gage #,Description,Type,S/N,Cal Frequency (days),Last Cal Date,Next Cal Due,Cal Vendor,Result,Status",
    "C-001,0-6 in digital caliper,,A123,365,01/15/2026,01/15/2027,Acme Cal Lab,Pass,Active",
    "M-002,0-1 in OD mic,Micrometer,,180,03/10/2026,09/10/2026,In-house,,Active",
    "H-003,12 in height gage,,,,2026-02-01,2027-02-01,,,",
    "R-004,Granite surface plate,,,,,,,,Reference only",
    "X-005,Bore gauge,,,,,,,,Active",
    ",,,,,,,,",
    "C-001,duplicate,,,,,,,,",
  ].join("\n");

  it("finds the header under a title row and reads each row", () => {
    const p = planGaugeImport(LIST, TODAY);
    expect(p.columns).toMatchObject({
      tag: "Gage #",
      description: "Description",
      interval: "Cal Frequency (days)",
      lastCalibratedOn: "Last Cal Date",
      dueOn: "Next Cal Due",
      calibratedBy: "Cal Vendor",
      result: "Result",
      serial: "S/N",
    });
    expect(
      p.rows.map((r) => [
        r.tag,
        r.kind,
        r.kindSource,
        r.status,
        r.intervalMonths,
        r.intervalSource,
      ]),
    ).toEqual([
      ["C-001", "caliper", "description", "active", 12, "file"],
      ["M-002", "micrometer", "file", "active", 6, "file"],
      ["H-003", "height_gauge", "description", "active", 12, "due"],
      ["R-004", "surface_plate", "description", "reference_only", null, null],
    ]);
    const msgs = p.issues.map((i) => `${i.line}: ${i.message}`);
    expect(msgs.some((m) => m.startsWith("7: X-005: in use with no calibration interval"))).toBe(
      true,
    );
    expect(msgs.some((m) => m.startsWith("9: C-001: same gauge id as line 3"))).toBe(true);
    expect(p.rows[0]).toMatchObject({
      performerFromFile: "external",
      result: "in_tolerance",
      serial: "A123",
    });
    expect(p.rows[1]).toMatchObject({ performerFromFile: "in_house", result: null });
  });

  it("records a last calibration only when its result and who did it are known", () => {
    const p = planGaugeImport(LIST, TODAY);
    const [c1, m2, h3] = p.rows;
    const a = plannedCalibration(c1 as GaugeImportRow, NONE, TODAY);
    expect(a.kind).toBe("record");
    if (a.kind === "record")
      expect(a.calibration).toMatchObject({
        calibratedOn: "2026-01-15",
        asFound: "in_tolerance",
        asLeft: "returned",
        performer: "external",
        performedBy: "Acme Cal Lab",
        dueOn: "2027-01-15",
        resultSource: "file",
      });
    expect(plannedCalibration(m2 as GaugeImportRow, NONE, TODAY)).toEqual({
      kind: "needs",
      result: true,
      performer: false,
    });
    const stated = plannedCalibration(
      m2 as GaugeImportRow,
      { lastCalPassed: true, performerDefault: null },
      TODAY,
    );
    expect(stated.kind === "record" && stated.calibration.readings).toContain("stated");
    expect(
      plannedCalibration(
        h3 as GaugeImportRow,
        { lastCalPassed: true, performerDefault: null },
        TODAY,
      ),
    ).toMatchObject({ kind: "needs", performer: true });
    const h = plannedCalibration(
      h3 as GaugeImportRow,
      { lastCalPassed: true, performerDefault: "in_house" },
      TODAY,
    );
    expect(h.kind === "record" && h.calibration.performedBy).toContain("Not named");
  });

  it("leaves an out-of-tolerance result on a gauge in use to the Gauges tab", () => {
    const p = planGaugeImport(
      "Gauge ID,Description,Interval,Last calibrated,Calibrated by,As found,Status\nP-1,Pin gauge,12,2026-06-01,Lab,Fail,Active\nP-2,Pin gauge,12,2026-06-01,Lab,Fail,Out of service",
      TODAY,
    );
    expect(plannedCalibration(p.rows[0] as GaugeImportRow, NONE, TODAY)).toMatchObject({
      kind: "needs",
    });
    const r = plannedCalibration(p.rows[1] as GaugeImportRow, NONE, TODAY);
    expect(r.kind === "record" && [r.calibration.asLeft, r.calibration.dueOn]).toEqual([
      "removed",
      null,
    ]);
  });

  it("refuses future calibrations, a due date before the calibration, and odd ids", () => {
    const p = planGaugeImport(
      "Gauge ID,Description,Interval,Last calibrated,Due\nA,Caliper,12,2027-01-01,\nB,Caliper,12,2026-05-01,2026-04-01\nC\u0007,Caliper,12,,",
      TODAY,
    );
    expect(p.rows.map((r) => [r.tag, r.lastCalibratedOn, r.dueOn])).toEqual([
      ["A", null, null],
      ["B", "2026-05-01", null],
    ]);
    expect(p.issues.map((i) => i.line)).toEqual([2, 3, 4]);
  });

  it("reads this register's own export back in", () => {
    const csv = gaugeListCsv(
      [
        {
          id: "g1",
          tag: "CAL-014",
          description: "0-6 in caliper",
          status: "active",
          intervalMonths: 12,
          lastCalibratedOn: "2026-03-01",
          dueOn: "2027-03-01",
          kind: "caliper",
          owner: "employee",
          serial: "S1",
          location: "Cell 2",
          lastCertificateNo: "C-88",
          lastPerformedBy: "Acme Calibration",
        },
        {
          id: "g2",
          tag: "=REF-1",
          description: "Granite plate",
          status: "reference_only",
          intervalMonths: null,
          lastCalibratedOn: null,
          dueOn: null,
          kind: "surface_plate",
          owner: "company",
          serial: "",
          location: "",
          lastCertificateNo: "",
          lastPerformedBy: "",
        },
      ],
      TODAY,
    );
    const p = planGaugeImport(csv, TODAY);
    expect(p.issues).toEqual([]);
    expect(p.rows[0]).toMatchObject({
      tag: "CAL-014",
      kind: "caliper",
      kindSource: "file",
      owner: "employee",
      location: "Cell 2",
      intervalMonths: 12,
      lastCalibratedOn: "2026-03-01",
      dueOn: "2027-03-01",
      calibratedBy: "Acme Calibration",
      certificateNo: "C-88",
    });
    expect(p.rows[1]).toMatchObject({ tag: "=REF-1", status: "reference_only" });
  });

  it("says what is missing when there is no header", () => {
    expect(planGaugeImport("a,b\n1,2", TODAY).issues[0]?.message).toContain("Gauge ID");
  });
});
