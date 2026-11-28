// Gauge list import: a parsed gauge list (src/shared/gauges-import.ts) checked against the org's gauge
// register and written in one D1 batch with one audit entry. A gauge id already on the list is left as
// it is (its calibrations change by recording one, never by a spreadsheet), so importing the same list
// twice, or this register's own export, changes nothing. Every other row becomes a new gauge, up to
// MAX_GAUGES_PER_ORG, with its last calibration as a calibration record when the result and who did it
// are known (plannedCalibration says when). Each row is checked with the form's rules (validateGauge,
// validateCalibration). Recording needs the quality plan, as the form does; the preview works on every
// plan.
import {
  type AsFound,
  type CalPerformer,
  type GaugeKind,
  type GaugeStatus,
  MAX_GAUGES_PER_ORG,
  validateCalibration,
  validateGauge,
} from "@shared/calibration";
import {
  type GaugeImportIssue,
  type GaugeImportOptions,
  type GaugeImportPlan,
  type GaugeImportRow,
  gaugeTagKey,
  type PlannedCalibration,
  planGaugeImport,
  plannedCalibration,
} from "@shared/gauges-import";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { gauge, gaugeCalibration } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";

export interface GaugeImportChange {
  line: number;
  tag: string;
  description: string;
  kind: GaugeKind;
  kindSource: GaugeImportRow["kindSource"];
  status: GaugeStatus;
  intervalMonths: number | null;
  intervalSource: GaugeImportRow["intervalSource"];
  /** The calibration record the row adds, or null when it adds none. */
  calibration: {
    calibratedOn: string;
    asFound: AsFound;
    performer: CalPerformer;
    performedBy: string;
    dueOn: string | null;
    resultSource: PlannedCalibration["resultSource"];
  } | null;
}

export interface GaugeImportPreview {
  columns: GaugeImportPlan["columns"];
  dates: GaugeImportPlan["dates"];
  changes: GaugeImportChange[];
  /** Rows whose gauge id is already on the list: left as they are. */
  alreadyListed: number;
  /** Rows with a last calibration date and no result cell (the whole-file statement would record them). */
  needResult: number;
  /** Rows with a last calibration and no "calibrated by" cell (the whole-file choice would record them). */
  needPerformer: number;
  issues: GaugeImportIssue[];
  existing: number;
  max: number;
  applied: boolean;
}

interface Planned {
  row: GaugeImportRow;
  calibration: PlannedCalibration | null;
}

async function match(ctx: AppContext, orgId: string, csv: string, opts: GaugeImportOptions) {
  const today = ctx.now().toISOString().slice(0, 10);
  const plan = planGaugeImport(csv, today, opts.dateOrder);
  const rows = await ctx.db
    .select({ tag: gauge.tag })
    .from(gauge)
    .where(eq(gauge.orgId, orgId))
    .all();
  const listed = new Set(rows.map((g) => gaugeTagKey(g.tag)));
  const issues = [...plan.issues];
  const planned: Planned[] = [];
  let alreadyListed = 0;
  let needResult = 0;
  let needPerformer = 0;
  for (const row of plan.rows) {
    if (listed.has(gaugeTagKey(row.tag))) {
      alreadyListed++;
      continue;
    }
    const note = (m: string) => issues.push({ line: row.line, message: `${row.tag}: ${m}` });
    const errors = validateGauge(row);
    if (errors.length) {
      note(`${errors.join(" ")} The row is left out.`);
      continue;
    }
    const cal = plannedCalibration(row, opts, today);
    let calibration: PlannedCalibration | null = null;
    if (cal.kind === "record") {
      const calErrors = validateCalibration(cal.calibration, today);
      if (calErrors.length) note(`the last calibration is left out: ${calErrors.join(" ")}`);
      else calibration = cal.calibration;
    } else if (cal.kind === "needs") {
      if (cal.message) note(cal.message);
      if (cal.result) needResult++;
      if (cal.performer) needPerformer++;
    }
    planned.push({ row, calibration });
  }
  if (needResult)
    issues.push({
      line: null,
      message: `${needResult} row${needResult === 1 ? " gives" : "s give"} a last calibration date with no result, so ${needResult === 1 ? "that gauge comes" : "those gauges come"} in as never calibrated. Add a result column (Pass or Fail, In or Out of tolerance), or state below that those calibrations were found in tolerance.`,
    });
  if (needPerformer)
    issues.push({
      line: null,
      message: `${needPerformer} row${needPerformer === 1 ? " gives" : "s give"} a last calibration with no "calibrated by" cell; choose below who calibrated them to record those calibrations.`,
    });
  if (rows.length + planned.length > MAX_GAUGES_PER_ORG)
    issues.unshift({
      line: null,
      message: `A gauge list holds at most ${MAX_GAUGES_PER_ORG} gauges: ${rows.length} are here and the file adds ${planned.length}. Import fewer rows.`,
    });
  const preview: GaugeImportPreview = {
    columns: plan.columns,
    dates: plan.dates,
    changes: planned.map(({ row, calibration: c }) => ({
      line: row.line,
      tag: row.tag,
      description: row.description,
      kind: row.kind,
      kindSource: row.kindSource,
      status: row.status,
      intervalMonths: row.intervalMonths,
      intervalSource: row.intervalSource,
      calibration: c
        ? {
            calibratedOn: c.calibratedOn,
            asFound: c.asFound,
            performer: c.performer,
            performedBy: c.performedBy,
            dueOn: c.dueOn,
            resultSource: c.resultSource,
          }
        : null,
    })),
    alreadyListed,
    needResult,
    needPerformer,
    issues,
    existing: rows.length,
    max: MAX_GAUGES_PER_ORG,
    applied: false,
  };
  return { preview, planned };
}

export async function previewGaugeImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
  opts: GaugeImportOptions,
): Promise<GaugeImportPreview> {
  return (await match(ctx, orgId, csv, opts)).preview;
}

export async function applyGaugeImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
  opts: GaugeImportOptions,
): Promise<GaugeImportPreview> {
  await assertQualityPlan(ctx, orgId);
  const { preview, planned } = await match(ctx, orgId, csv, opts);
  if (!planned.length) return preview;
  if (preview.existing + planned.length > MAX_GAUGES_PER_ORG)
    throw conflict(`A gauge list holds at most ${MAX_GAUGES_PER_ORG} gauges.`);
  const gauges: (typeof gauge.$inferInsert)[] = [];
  const cals: (typeof gaugeCalibration.$inferInsert)[] = [];
  for (const { row, calibration: c } of planned) {
    const id = newId("gau");
    gauges.push({
      id,
      orgId,
      tag: row.tag,
      description: row.description,
      kind: row.kind,
      manufacturer: row.manufacturer,
      serial: row.serial,
      range: row.range,
      location: row.location,
      owner: row.owner,
      assignedTo: row.assignedTo,
      status: row.status,
      intervalMonths: row.intervalMonths,
      method: row.method,
      notes: row.notes,
    });
    if (c)
      cals.push({
        id: newId("gca"),
        orgId,
        gaugeId: id,
        calibratedOn: c.calibratedOn,
        performer: c.performer,
        performedBy: c.performedBy,
        asFound: c.asFound,
        asLeft: c.asLeft,
        readings: c.readings,
        certificateNo: c.certificateNo,
        traceability: c.traceability,
        intervalMonths: c.intervalMonths,
        dueOn: c.dueOn,
        recordedBy: actorUserId,
      });
  }
  // About 17 bound values a gauge and 21 a calibration; D1 allows 100 per statement.
  const statements = [];
  for (let i = 0; i < gauges.length; i += 5)
    statements.push(ctx.db.insert(gauge).values(gauges.slice(i, i + 5)));
  for (let i = 0; i < cals.length; i += 4)
    statements.push(ctx.db.insert(gaugeCalibration).values(cals.slice(i, i + 4)));
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "gauge.import",
    targetType: "gauge",
    targetId: `new:${gauges.length},calibrations:${cals.length}`,
  });
  return { ...preview, applied: true };
}
