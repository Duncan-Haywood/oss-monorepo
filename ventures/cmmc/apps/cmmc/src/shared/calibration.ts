// Gauge and instrument calibration for the ISO 9001 side of the workspace (clause 7.1.5,
// "Monitoring and measuring resources"): the shop's list of calipers, micrometers, height gauges,
// pin and thread gauges, CMMs and torque wrenches, each with its calibration interval, the record of
// every calibration (as found, as left, who did it, the certificate and the standard it traces to),
// the date it falls due, and what was done when one was found out of tolerance.
// Shared by the Worker and the SPA; everything here is pure.
//
// ISO 9001's text is copyrighted, so nothing here quotes it: the clause number points a reader to the
// standard, and the checks are plain-language readings of what auditors ask to see on a shop floor
// (an identified gauge, a due date it is within, a certificate that names a traceable standard, and,
// when a gauge was found out of tolerance, a record of whether parts measured with it since its last
// good calibration were affected). docs/SOURCES.md, "Calibration". The register is a record-keeping
// aid; it does not make a quality system conform to ISO 9001 or AS9100.

import { daysBetween, isIsoDate } from "./affirmation";
import { addMonths } from "./security-policies";

export const GAUGE_KINDS = [
  "caliper",
  "micrometer",
  "height_gauge",
  "indicator",
  "pin_plug_gauge",
  "thread_gauge",
  "ring_gauge",
  "gauge_blocks",
  "cmm",
  "torque_tool",
  "surface_plate",
  "scale",
  "hardness_tester",
  "other",
] as const;
export type GaugeKind = (typeof GAUGE_KINDS)[number];

export const GAUGE_KIND_LABEL: Record<GaugeKind, string> = {
  caliper: "Caliper",
  micrometer: "Micrometer",
  height_gauge: "Height gauge",
  indicator: "Dial or test indicator",
  pin_plug_gauge: "Pin or plug gauge",
  thread_gauge: "Thread gauge",
  ring_gauge: "Ring gauge",
  gauge_blocks: "Gauge blocks",
  cmm: "CMM",
  torque_tool: "Torque wrench or driver",
  surface_plate: "Surface plate",
  scale: "Scale or balance",
  hardness_tester: "Hardness tester",
  other: "Other",
};

/**
 * active: used to accept product, so it is calibrated on an interval;
 * reference_only: labelled "reference only", never used to accept product, so no calibration is due;
 * out_of_service: tagged out (damaged, failed, waiting on repair), kept on the list;
 * retired: scrapped, lost or sold, kept for the record of what it measured.
 */
export const GAUGE_STATUSES = ["active", "reference_only", "out_of_service", "retired"] as const;
export type GaugeStatus = (typeof GAUGE_STATUSES)[number];

export const GAUGE_STATUS_LABEL: Record<GaugeStatus, string> = {
  active: "In use",
  reference_only: "Reference only",
  out_of_service: "Out of service",
  retired: "Retired",
};

/** Company-owned, or a machinist's own tool used on the shop's work (common in job shops). */
export const GAUGE_OWNERS = ["company", "employee", "customer"] as const;
export type GaugeOwner = (typeof GAUGE_OWNERS)[number];

export const GAUGE_OWNER_LABEL: Record<GaugeOwner, string> = {
  company: "Company",
  employee: "Employee's own",
  customer: "Customer's",
};

/** Who calibrated it: the shop against its own masters, or an outside lab. */
export const CAL_PERFORMERS = ["in_house", "external"] as const;
export type CalPerformer = (typeof CAL_PERFORMERS)[number];

export const CAL_PERFORMER_LABEL: Record<CalPerformer, string> = {
  in_house: "In house",
  external: "Outside lab",
};

/** As found: the reading before anything was adjusted. */
export const AS_FOUND = ["in_tolerance", "out_of_tolerance"] as const;
export type AsFound = (typeof AS_FOUND)[number];

export const AS_FOUND_LABEL: Record<AsFound, string> = {
  in_tolerance: "In tolerance",
  out_of_tolerance: "Out of tolerance",
};

/** As left: back in use as it was, adjusted or repaired and back in use, or taken out of use. */
export const AS_LEFT = ["returned", "adjusted", "removed"] as const;
export type AsLeft = (typeof AS_LEFT)[number];

export const AS_LEFT_LABEL: Record<AsLeft, string> = {
  returned: "Back in use, no adjustment",
  adjusted: "Adjusted or repaired, back in use",
  removed: "Taken out of use",
};

/** Intervals a shop can pick from; any whole number of months from 1 to 60 is accepted. */
export const CAL_INTERVAL_CHOICES = [1, 3, 6, 12, 24] as const;
export const CAL_INTERVAL_MIN = 1;
export const CAL_INTERVAL_MAX = 60;

export const CAL_DUE_SOON_DAYS = 30;
export const MAX_GAUGES_PER_ORG = 2000;
export const GAUGE_TAG_MAX = 40;
export const GAUGE_TEXT_MAX = 200;
export const CAL_TEXT_MAX = 4000;

/** Where the clause list points: 7.1.5 is monitoring and measuring resources. */
export const CALIBRATION_CLAUSE_ID = "iso9001-7.1.5";

// Printable characters only: a gauge id ends up on a sticker, in a CSV and on an inspection report.
const CLEAN = /^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$/u;

export interface GaugeFields {
  tag: string;
  description: string;
  kind: GaugeKind;
  status: GaugeStatus;
  owner: GaugeOwner;
  /** Months between calibrations; null only for a gauge that is not in use (reference, out, retired). */
  intervalMonths: number | null;
}

/** Problems with a gauge's fields before they are stored; an empty list means they can be saved. */
export function validateGauge(g: GaugeFields): string[] {
  const errors: string[] = [];
  if (!g.tag.trim()) errors.push("Give the gauge its id (the number on its sticker or engraving).");
  else if (g.tag.length > GAUGE_TAG_MAX || !CLEAN.test(g.tag))
    errors.push(
      `A gauge id is up to ${GAUGE_TAG_MAX} printable characters, with no spaces at either end.`,
    );
  if (!g.description.trim()) errors.push("Say what the gauge is (for example 0-6 in caliper).");
  else if (g.description.length > GAUGE_TEXT_MAX)
    errors.push(`A description is up to ${GAUGE_TEXT_MAX} characters.`);
  if (!(GAUGE_KINDS as readonly string[]).includes(g.kind)) errors.push("Pick the kind of gauge.");
  if (!(GAUGE_STATUSES as readonly string[]).includes(g.status)) errors.push("Pick a status.");
  if (!(GAUGE_OWNERS as readonly string[]).includes(g.owner)) errors.push("Pick who owns it.");
  if (g.intervalMonths !== null) {
    if (
      !Number.isInteger(g.intervalMonths) ||
      g.intervalMonths < CAL_INTERVAL_MIN ||
      g.intervalMonths > CAL_INTERVAL_MAX
    )
      errors.push(
        `A calibration interval is a whole number of months from ${CAL_INTERVAL_MIN} to ${CAL_INTERVAL_MAX}.`,
      );
  } else if (g.status === "active")
    errors.push("A gauge in use needs a calibration interval (or mark it reference only).");
  return errors;
}

export interface CalibrationFields {
  calibratedOn: string;
  performer: CalPerformer;
  /** The lab's name, or the person who did it in house. */
  performedBy: string;
  asFound: AsFound;
  asLeft: AsLeft;
  certificateNo: string;
  /** The master or lab accreditation the result traces to (gauge blocks S/N, ISO/IEC 17025 cert). */
  traceability: string;
}

/** Problems with a calibration record before it is stored. `today` bounds the date. */
export function validateCalibration(c: CalibrationFields, today: string): string[] {
  const errors: string[] = [];
  if (!isIsoDate(c.calibratedOn)) errors.push("Give the date it was calibrated.");
  else if (c.calibratedOn > today) errors.push("A calibration date cannot be in the future.");
  if (!(CAL_PERFORMERS as readonly string[]).includes(c.performer))
    errors.push("Say whether it was calibrated in house or by an outside lab.");
  if (!c.performedBy.trim()) errors.push("Say who calibrated it (the lab, or the person).");
  if (!(AS_FOUND as readonly string[]).includes(c.asFound))
    errors.push("Say whether it was found in tolerance.");
  if (!(AS_LEFT as readonly string[]).includes(c.asLeft))
    errors.push("Say whether it went back into use.");
  return errors;
}

/** The date the next calibration falls due: the interval after the last calibration. */
export function nextDue(calibratedOn: string, intervalMonths: number): string {
  return addMonths(calibratedOn, intervalMonths);
}

/** What a recorded calibration does to the gauge's status: taken out of use, or back in use. */
export function statusAfterCalibration(current: GaugeStatus, asLeft: AsLeft): GaugeStatus {
  if (asLeft === "removed") return current === "retired" ? "retired" : "out_of_service";
  return current === "out_of_service" ? "active" : current;
}

/**
 * Where a gauge stands today.
 * not_in_use: reference only, out of service or retired (nothing falls due);
 * never: in use with no calibration recorded; overdue: past its due date, so it should not be used
 * to accept parts; due_soon: due within CAL_DUE_SOON_DAYS; current: within its interval.
 */
export type CalState = "not_in_use" | "never" | "overdue" | "due_soon" | "current";

export interface GaugeLike {
  id: string;
  tag: string;
  description: string;
  status: GaugeStatus;
  intervalMonths: number | null;
  /** The last calibration's date (the service reads it from the history). */
  lastCalibratedOn: string | null;
  /** The due date stored with the last calibration, or worked out from the interval. */
  dueOn: string | null;
}

export function calState(g: Pick<GaugeLike, "status" | "dueOn">, today: string): CalState {
  if (g.status !== "active") return "not_in_use";
  if (!g.dueOn) return "never";
  if (g.dueOn <= today) return "overdue";
  if (daysBetween(today, g.dueOn) <= CAL_DUE_SOON_DAYS) return "due_soon";
  return "current";
}

export interface CalibrationLike {
  id: string;
  calibratedOn: string;
  performer: CalPerformer;
  asFound: AsFound;
  certificateNo: string;
  traceability: string;
  /** What was done about parts measured since the last good calibration (out of tolerance only). */
  impact: string;
}

export interface GaugeIssue {
  /** gap: an auditor would write it up; soon: falls due shortly; note: worth tidying. */
  kind: "gap" | "soon" | "note";
  text: string;
}

/**
 * What an auditor would ask about one gauge, given its history (newest first). The out-of-tolerance
 * check looks at every calibration, not only the last: an old one found out with no record of what
 * it meant for parts is still open.
 */
export function gaugeIssues(
  g: GaugeLike,
  history: readonly CalibrationLike[],
  today: string,
): GaugeIssue[] {
  const issues: GaugeIssue[] = [];
  const state = calState(g, today);
  if (state === "never")
    issues.push({
      kind: "gap",
      text: "In use with no calibration recorded: calibrate it, or record the last certificate.",
    });
  else if (state === "overdue")
    issues.push({
      kind: "gap",
      text: `Calibration was due ${g.dueOn}: pull it from use until it is calibrated.`,
    });
  else if (state === "due_soon") issues.push({ kind: "soon", text: `Calibration due ${g.dueOn}.` });
  history.forEach((c, i) => {
    if (c.asFound === "out_of_tolerance" && !c.impact.trim()) {
      const previous = history[i + 1];
      const since = previous ? ` since ${previous.calibratedOn}` : "";
      issues.push({
        kind: "gap",
        text: `Found out of tolerance on ${c.calibratedOn}: record what was measured with it${since} and whether any parts were affected.`,
      });
    }
  });
  const last = history[0];
  if (last && g.status === "active") {
    if (last.performer === "external" && !last.certificateNo.trim())
      issues.push({
        kind: "note",
        text: `No certificate number for the ${last.calibratedOn} calibration.`,
      });
    if (!last.traceability.trim())
      issues.push({
        kind: "note",
        text: `The ${last.calibratedOn} calibration does not say what standard it traces to.`,
      });
  }
  return issues;
}

export interface CalibrationCheck {
  total: number;
  inUse: number;
  current: number;
  dueSoon: number;
  overdue: number;
  never: number;
  /** Out-of-tolerance results with no impact record, across all gauges. */
  openOutOfTolerance: number;
}

export function checkGauges(
  list: readonly { gauge: GaugeLike; history: readonly CalibrationLike[] }[],
  today: string,
): CalibrationCheck {
  const out: CalibrationCheck = {
    total: list.length,
    inUse: 0,
    current: 0,
    dueSoon: 0,
    overdue: 0,
    never: 0,
    openOutOfTolerance: 0,
  };
  for (const { gauge, history } of list) {
    const s = calState(gauge, today);
    if (s !== "not_in_use") out.inUse++;
    if (s === "current") out.current++;
    else if (s === "due_soon") out.dueSoon++;
    else if (s === "overdue") out.overdue++;
    else if (s === "never") out.never++;
    out.openOutOfTolerance += history.filter(
      (c) => c.asFound === "out_of_tolerance" && !c.impact.trim(),
    ).length;
  }
  return out;
}

export interface GaugeDue {
  gaugeId: string;
  tag: string;
  description: string;
  state: "overdue" | "due_soon" | "never";
  dueOn: string | null;
}

/**
 * The recall list: gauges in use that are overdue (oldest first), then due within
 * CAL_DUE_SOON_DAYS (soonest first), then never calibrated (by id). What a shop sends to the lab next.
 */
export function gaugesDue(list: readonly GaugeLike[], today: string): GaugeDue[] {
  const rank = { overdue: 0, due_soon: 1, never: 2 } as const;
  const out: GaugeDue[] = [];
  for (const g of list) {
    const s = calState(g, today);
    if (s === "overdue" || s === "due_soon" || s === "never")
      out.push({ gaugeId: g.id, tag: g.tag, description: g.description, state: s, dueOn: g.dueOn });
  }
  return out.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.dueOn ?? "").localeCompare(b.dueOn ?? "") ||
      a.tag.localeCompare(b.tag),
  );
}

/** Quote a CSV cell when it needs it, and keep a leading = + - @ from running as a formula. */
function cell(v: string | number | null): string {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface GaugeCsvRow extends GaugeLike {
  kind: GaugeKind;
  owner: GaugeOwner;
  serial: string;
  location: string;
  lastCertificateNo: string;
  lastPerformedBy: string;
}

/** The gauge list as a spreadsheet: one row per gauge, its state today and its last calibration. */
export function gaugeListCsv(rows: readonly GaugeCsvRow[], today: string): string {
  const header = [
    "Gauge id",
    "Description",
    "Kind",
    "Serial",
    "Owner",
    "Location",
    "Status",
    "Interval (months)",
    "Last calibrated",
    "Calibrated by",
    "Certificate",
    "Due",
    "State today",
  ];
  const stateText: Record<CalState, string> = {
    not_in_use: "Not in use",
    never: "Never calibrated",
    overdue: "Overdue",
    due_soon: "Due soon",
    current: "Current",
  };
  const lines = [header.join(",")];
  for (const r of rows)
    lines.push(
      [
        r.tag,
        r.description,
        GAUGE_KIND_LABEL[r.kind],
        r.serial,
        GAUGE_OWNER_LABEL[r.owner],
        r.location,
        GAUGE_STATUS_LABEL[r.status],
        r.intervalMonths,
        r.lastCalibratedOn,
        r.lastPerformedBy,
        r.lastCertificateNo,
        r.dueOn,
        stateText[calState(r, today)],
      ]
        .map(cell)
        .join(","),
    );
  return `${lines.join("\r\n")}\r\n`;
}
