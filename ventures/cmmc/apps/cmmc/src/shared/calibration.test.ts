// The calibration register's pure rules, checked against hand-worked dates.
import { describe, expect, it } from "vitest";
import {
  type CalibrationLike,
  calibrationDueDates,
  calState,
  checkGauges,
  type GaugeLike,
  gaugeIssues,
  gaugeListCsv,
  gaugesDue,
  nextDue,
  statusAfterCalibration,
  validateCalibration,
  validateGauge,
} from "./calibration";

const TODAY = "2026-11-28";

const gauge = (over: Partial<GaugeLike> = {}): GaugeLike => ({
  id: "g1",
  tag: "CAL-014",
  description: "0-6 in digital caliper",
  status: "active",
  intervalMonths: 12,
  lastCalibratedOn: "2026-03-02",
  dueOn: "2027-03-02",
  ...over,
});

const cal = (over: Partial<CalibrationLike> = {}): CalibrationLike => ({
  id: "c1",
  calibratedOn: "2026-03-02",
  performer: "external",
  asFound: "in_tolerance",
  certificateNo: "C-88121",
  traceability: "NIST-traceable, lab ISO/IEC 17025 cert 1234.01",
  impact: "",
  ...over,
});

describe("nextDue", () => {
  it("adds whole months and clamps to the month's last day", () => {
    expect(nextDue("2026-03-02", 12)).toBe("2027-03-02");
    expect(nextDue("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextDue("2024-02-29", 12)).toBe("2025-02-28");
    expect(nextDue("2026-08-31", 6)).toBe("2027-02-28");
  });
});

describe("calState", () => {
  it("reads the due date against today", () => {
    expect(calState(gauge(), TODAY)).toBe("current");
    // 30 days ahead is due soon; 31 is not.
    expect(calState(gauge({ dueOn: "2026-12-28" }), TODAY)).toBe("due_soon");
    expect(calState(gauge({ dueOn: "2026-12-29" }), TODAY)).toBe("current");
    // The due date itself is overdue: the calibration has run out.
    expect(calState(gauge({ dueOn: TODAY }), TODAY)).toBe("overdue");
    expect(calState(gauge({ dueOn: null }), TODAY)).toBe("never");
  });
  it("puts nothing due on a gauge not in use", () => {
    for (const status of ["reference_only", "out_of_service", "retired"] as const)
      expect(calState(gauge({ status, dueOn: "2020-01-01" }), TODAY)).toBe("not_in_use");
  });
});

describe("validateGauge", () => {
  const ok = {
    tag: "MIC-3",
    description: "1-2 in micrometer",
    kind: "micrometer" as const,
    status: "active" as const,
    owner: "company" as const,
    intervalMonths: 12,
  };
  it("accepts a complete gauge", () => expect(validateGauge(ok)).toEqual([]));
  it("needs an interval for a gauge in use, not for reference only", () => {
    expect(validateGauge({ ...ok, intervalMonths: null }).join(" ")).toContain("interval");
    expect(validateGauge({ ...ok, status: "reference_only", intervalMonths: null })).toEqual([]);
  });
  it("refuses odd ids and intervals", () => {
    expect(validateGauge({ ...ok, tag: " MIC-3" })).toHaveLength(1);
    expect(validateGauge({ ...ok, tag: "" })).toHaveLength(1);
    expect(validateGauge({ ...ok, intervalMonths: 0 })).toHaveLength(1);
    expect(validateGauge({ ...ok, intervalMonths: 61 })).toHaveLength(1);
    expect(validateGauge({ ...ok, intervalMonths: 1.5 })).toHaveLength(1);
  });
});

describe("validateCalibration", () => {
  const ok = {
    calibratedOn: "2026-11-01",
    performer: "external" as const,
    performedBy: "Acme Calibration Lab",
    asFound: "in_tolerance" as const,
    asLeft: "returned" as const,
    certificateNo: "",
    traceability: "",
  };
  it("accepts a past or today's date and refuses a future one", () => {
    expect(validateCalibration(ok, TODAY)).toEqual([]);
    expect(validateCalibration({ ...ok, calibratedOn: TODAY }, TODAY)).toEqual([]);
    expect(validateCalibration({ ...ok, calibratedOn: "2026-11-29" }, TODAY)).toHaveLength(1);
    expect(validateCalibration({ ...ok, calibratedOn: "2026-02-30" }, TODAY)).toHaveLength(1);
  });
  it("needs who did it", () =>
    expect(validateCalibration({ ...ok, performedBy: "  " }, TODAY)).toHaveLength(1));
});

describe("statusAfterCalibration", () => {
  it("takes a removed gauge out of use and brings a repaired one back", () => {
    expect(statusAfterCalibration("active", "removed")).toBe("out_of_service");
    expect(statusAfterCalibration("out_of_service", "adjusted")).toBe("active");
    expect(statusAfterCalibration("active", "returned")).toBe("active");
    expect(statusAfterCalibration("reference_only", "returned")).toBe("reference_only");
  });
});

describe("gaugeIssues", () => {
  it("has nothing to say about a current gauge with a certificate", () =>
    expect(gaugeIssues(gauge(), [cal()], TODAY)).toEqual([]));
  it("flags an overdue gauge and a gauge never calibrated as gaps", () => {
    const overdue = gaugeIssues(gauge({ dueOn: "2026-11-01" }), [cal()], TODAY);
    expect(overdue).toEqual([{ kind: "gap", text: expect.stringContaining("pull it from use") }]);
    const never = gaugeIssues(gauge({ dueOn: null, lastCalibratedOn: null }), [], TODAY);
    expect(never[0]?.kind).toBe("gap");
  });
  it("asks for the impact of every out-of-tolerance result, naming the window", () => {
    const history = [
      cal({ id: "c3", calibratedOn: "2026-03-02", asFound: "out_of_tolerance" }),
      cal({ id: "c2", calibratedOn: "2025-03-01" }),
    ];
    const issues = gaugeIssues(gauge(), history, TODAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.text).toContain("since 2025-03-01");
    const done = gaugeIssues(
      gauge(),
      [
        {
          ...(history[0] as CalibrationLike),
          impact: "Re-measured lots 4411-4419 on the CMM: all in tolerance.",
        },
      ],
      TODAY,
    );
    expect(done).toEqual([]);
  });
  it("notes a lab calibration with no certificate or traceability", () => {
    const issues = gaugeIssues(gauge(), [cal({ certificateNo: "", traceability: "" })], TODAY);
    expect(issues.map((i) => i.kind)).toEqual(["note", "note"]);
    // In house, no certificate number is expected.
    const inHouse = gaugeIssues(
      gauge(),
      [cal({ performer: "in_house", certificateNo: "", traceability: "Gauge blocks GB-1" })],
      TODAY,
    );
    expect(inHouse).toEqual([]);
  });
});

describe("checkGauges and gaugesDue", () => {
  const list = [
    gauge({ id: "a", tag: "A", dueOn: "2027-06-01" }),
    gauge({ id: "b", tag: "B", dueOn: "2026-12-10" }),
    gauge({ id: "c", tag: "C", dueOn: "2026-10-01" }),
    gauge({ id: "d", tag: "D", dueOn: null }),
    gauge({ id: "e", tag: "E", dueOn: "2026-09-01" }),
    gauge({ id: "f", tag: "F", status: "retired", dueOn: "2020-01-01" }),
  ];
  it("counts by state", () => {
    const check = checkGauges(
      list.map((g) => ({
        gauge: g,
        history: g.id === "a" ? [cal({ asFound: "out_of_tolerance" })] : [],
      })),
      TODAY,
    );
    expect(check).toEqual({
      total: 6,
      inUse: 5,
      current: 1,
      dueSoon: 1,
      overdue: 2,
      never: 1,
      openOutOfTolerance: 1,
    });
  });
  it("lists the recall: overdue oldest first, then due soon, then never", () => {
    expect(gaugesDue(list, TODAY).map((d) => d.tag)).toEqual(["E", "C", "B", "D"]);
  });
});

describe("gaugeListCsv", () => {
  it("writes one row per gauge and defuses formula cells", () => {
    const csv = gaugeListCsv(
      [
        {
          ...gauge({ description: "=HYPERLINK(1)" }),
          kind: "caliper",
          owner: "employee",
          serial: "SN 1, 2",
          location: "Cell 3",
          lastCertificateNo: "C-88121",
          lastPerformedBy: "Acme Lab",
        },
      ],
      TODAY,
    );
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Gauge id,Description,Kind/);
    expect(lines[1]).toBe(
      `CAL-014,'=HYPERLINK(1),Caliper,"SN 1, 2",Employee's own,Cell 3,In use,12,2026-03-02,Acme Lab,C-88121,2027-03-02,Current`,
    );
  });
});

describe("calibrationDueDates", () => {
  it("counts gauges in use per due date, oldest first, and skips gauges with no date", () => {
    expect(
      calibrationDueDates([
        { status: "active", dueOn: "2027-03-01" },
        { status: "active", dueOn: "2027-01-15" },
        { status: "active", dueOn: "2027-03-01" },
        { status: "active", dueOn: null },
        { status: "reference_only", dueOn: "2027-01-15" },
        { status: "out_of_service", dueOn: "2027-01-15" },
        { status: "retired", dueOn: "2027-01-15" },
        { status: "active", dueOn: "not-a-date" },
      ]),
    ).toEqual([
      { due: "2027-01-15", gauges: 1 },
      { due: "2027-03-01", gauges: 2 },
    ]);
  });

  it("keeps an overdue date, so the calendar still shows it", () => {
    expect(calibrationDueDates([{ status: "active", dueOn: "2020-01-01" }])).toEqual([
      { due: "2020-01-01", gauges: 1 },
    ]);
  });
});
