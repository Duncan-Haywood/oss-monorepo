// Gauge and instrument calibration (ISO 9001 7.1.5). Rows are tenant-scoped; every write is audited.
// Reading works on every plan; recording needs the Level 2 + Quality plan, like the rest of the ISO
// 9001 side. Calibrations are kept as recorded: the only later write is the impact record of an
// out-of-tolerance result. The rules are pure, in @shared/calibration.
import {
  type AsFound,
  type AsLeft,
  type CalibrationLike,
  type CalPerformer,
  calibrationDueDates,
  calState,
  checkGauges,
  type GaugeKind,
  type GaugeLike,
  type GaugeOwner,
  type GaugeStatus,
  gaugeIssues,
  gaugeListCsv,
  gaugesDue,
  MAX_GAUGES_PER_ORG,
  nextDue,
  statusAfterCalibration,
  validateCalibration,
  validateGauge,
} from "@shared/calibration";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence, gauge, gaugeCalibration } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";

export type GaugeRow = typeof gauge.$inferSelect;
export type CalibrationRow = typeof gaugeCalibration.$inferSelect;

export interface GaugeInput {
  tag: string;
  description: string;
  kind: GaugeKind;
  manufacturer?: string;
  serial?: string;
  range?: string;
  location?: string;
  owner?: GaugeOwner;
  assignedTo?: string;
  status?: GaugeStatus;
  intervalMonths?: number | null;
  method?: string;
  notes?: string;
}

export interface CalibrationInput {
  calibratedOn: string;
  performer: CalPerformer;
  performedBy: string;
  asFound: AsFound;
  asLeft: AsLeft;
  readings?: string;
  certificateNo?: string;
  traceability?: string;
  evidenceId?: string | null;
  impact?: string;
  correctiveActionRef?: string;
}

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

async function record(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  action: string,
  id: string,
) {
  await audit(ctx, {
    orgId,
    actorUserId,
    action: `gauge.${action}`,
    targetType: "gauge",
    targetId: id,
  });
}

async function historyByGauge(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(gaugeCalibration)
    .where(eq(gaugeCalibration.orgId, orgId))
    .orderBy(desc(gaugeCalibration.calibratedOn), desc(gaugeCalibration.createdAt))
    .all();
  const by = new Map<string, CalibrationRow[]>();
  for (const r of rows) {
    const list = by.get(r.gaugeId);
    if (list) list.push(r);
    else by.set(r.gaugeId, [r]);
  }
  return by;
}

/** The gauge with its last calibration's date and due date, as the pure checks read it. */
function asLike(g: GaugeRow, history: readonly CalibrationRow[]): GaugeLike {
  const last = history[0];
  // The due date recorded with the last calibration, unless the interval changed since: then the new
  // interval counts from the same calibration, as an auditor would read the list.
  const dueOn = last
    ? g.intervalMonths !== null && g.intervalMonths !== last.intervalMonths
      ? nextDue(last.calibratedOn, g.intervalMonths)
      : (last.dueOn ?? (g.intervalMonths ? nextDue(last.calibratedOn, g.intervalMonths) : null))
    : null;
  return {
    id: g.id,
    tag: g.tag,
    description: g.description,
    status: g.status,
    intervalMonths: g.intervalMonths,
    lastCalibratedOn: last?.calibratedOn ?? null,
    dueOn,
  };
}

export async function listGauges(ctx: AppContext, orgId: string): Promise<GaugeRow[]> {
  return ctx.db.select().from(gauge).where(eq(gauge.orgId, orgId)).orderBy(asc(gauge.tag)).all();
}

export async function gaugeList(ctx: AppContext, orgId: string) {
  const [rows, by] = await Promise.all([listGauges(ctx, orgId), historyByGauge(ctx, orgId)]);
  const on = today(ctx);
  const items = rows.map((g) => {
    const history = by.get(g.id) ?? [];
    const like = asLike(g, history);
    return {
      ...g,
      lastCalibratedOn: like.lastCalibratedOn,
      dueOn: like.dueOn,
      state: calState(like, on),
      issues: gaugeIssues(like, history as CalibrationLike[], on),
      calibrations: history.length,
    };
  });
  return {
    today: on,
    items,
    check: checkGauges(
      rows.map((g) => {
        const history = by.get(g.id) ?? [];
        return { gauge: asLike(g, history), history: history as CalibrationLike[] };
      }),
      on,
    ),
    due: gaugesDue(
      rows.map((g) => asLike(g, by.get(g.id) ?? [])),
      on,
    ),
  };
}

/** Gauges in use falling due on each date, as counts: for the calendar file and subscribable link. */
export async function calibrationDueDatesFor(ctx: AppContext, orgId: string) {
  const [rows, by] = await Promise.all([listGauges(ctx, orgId), historyByGauge(ctx, orgId)]);
  return calibrationDueDates(rows.map((g) => asLike(g, by.get(g.id) ?? [])));
}

export async function gaugeCsv(ctx: AppContext, orgId: string): Promise<string> {
  const [rows, by] = await Promise.all([listGauges(ctx, orgId), historyByGauge(ctx, orgId)]);
  return gaugeListCsv(
    rows.map((g) => {
      const history = by.get(g.id) ?? [];
      const last = history[0];
      return {
        ...asLike(g, history),
        kind: g.kind,
        owner: g.owner,
        serial: g.serial,
        location: g.location,
        lastCertificateNo: last?.certificateNo ?? "",
        lastPerformedBy: last?.performedBy ?? "",
      };
    }),
    today(ctx),
  );
}

export async function getGauge(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(gauge)
    .where(and(eq(gauge.id, id), eq(gauge.orgId, orgId)))
    .get();
  if (!row) throw notFound("Gauge");
  return row;
}

export async function gaugeHistory(ctx: AppContext, orgId: string, id: string) {
  await getGauge(ctx, orgId, id);
  return ctx.db
    .select()
    .from(gaugeCalibration)
    .where(and(eq(gaugeCalibration.gaugeId, id), eq(gaugeCalibration.orgId, orgId)))
    .orderBy(desc(gaugeCalibration.calibratedOn), desc(gaugeCalibration.createdAt))
    .all();
}

function checkFields(merged: GaugeInput) {
  const errors = validateGauge({
    tag: merged.tag,
    description: merged.description,
    kind: merged.kind,
    status: merged.status ?? "active",
    owner: merged.owner ?? "company",
    intervalMonths: merged.intervalMonths ?? null,
  });
  if (errors.length) throw badRequest(errors.join(" "));
}

async function assertTagFree(ctx: AppContext, orgId: string, tag: string, exceptId?: string) {
  const clash = await ctx.db
    .select({ id: gauge.id })
    .from(gauge)
    .where(and(eq(gauge.orgId, orgId), eq(gauge.tag, tag)))
    .get();
  if (clash && clash.id !== exceptId) throw conflict(`Gauge ${tag} is already on the list.`);
}

export async function createGauge(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: GaugeInput,
) {
  await assertQualityPlan(ctx, orgId);
  checkFields(input);
  const existing = await ctx.db
    .select({ n: count() })
    .from(gauge)
    .where(eq(gauge.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_GAUGES_PER_ORG)
    throw conflict(`A list holds at most ${MAX_GAUGES_PER_ORG} gauges.`);
  await assertTagFree(ctx, orgId, input.tag);
  const id = newId("gau");
  await ctx.db.insert(gauge).values({
    id,
    orgId,
    tag: input.tag,
    description: input.description,
    kind: input.kind,
    manufacturer: input.manufacturer ?? "",
    serial: input.serial ?? "",
    range: input.range ?? "",
    location: input.location ?? "",
    owner: input.owner ?? "company",
    assignedTo: input.assignedTo ?? "",
    status: input.status ?? "active",
    intervalMonths: input.intervalMonths ?? null,
    method: input.method ?? "",
    notes: input.notes ?? "",
  });
  await record(ctx, orgId, actorUserId, "create", id);
  return getGauge(ctx, orgId, id);
}

export async function updateGauge(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<GaugeInput>,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getGauge(ctx, orgId, id);
  // Validated as the row will be after the change, so a patch cannot leave it inconsistent.
  checkFields({ ...row, ...patch });
  if (patch.tag !== undefined && patch.tag !== row.tag)
    await assertTagFree(ctx, orgId, patch.tag, id);
  await ctx.db
    .update(gauge)
    .set(patch)
    .where(and(eq(gauge.id, id), eq(gauge.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "update", id);
  return getGauge(ctx, orgId, id);
}

/** A gauge with calibrations recorded is kept (retire it); one entered by mistake can be deleted. */
export async function deleteGauge(ctx: AppContext, orgId: string, actorUserId: string, id: string) {
  await assertQualityPlan(ctx, orgId);
  const history = await gaugeHistory(ctx, orgId, id);
  if (history.length)
    throw conflict(
      "A gauge with calibrations recorded is kept as the record of what it measured: mark it retired instead.",
    );
  await ctx.db.delete(gauge).where(and(eq(gauge.id, id), eq(gauge.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "delete", id);
}

async function orgFile(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select({ id: evidence.id, fileName: evidence.fileName, sha256: evidence.sha256 })
    .from(evidence)
    .where(and(eq(evidence.id, id), eq(evidence.orgId, orgId)))
    .get();
  if (!row) throw badRequest("Link an evidence file this organization holds.");
  return row;
}

/**
 * Records a calibration: the due date it gives (from the gauge's interval), and what it does to the
 * gauge's status (taken out of use, or back in use after a repair). A calibration older than the
 * newest one already recorded is accepted (a certificate found later) and does not change the status.
 */
export async function recordCalibration(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: CalibrationInput,
) {
  await assertQualityPlan(ctx, orgId);
  const g = await getGauge(ctx, orgId, id);
  if (g.status === "retired") throw conflict("A retired gauge is kept as it was retired.");
  const errors = validateCalibration(
    {
      calibratedOn: input.calibratedOn,
      performer: input.performer,
      performedBy: input.performedBy,
      asFound: input.asFound,
      asLeft: input.asLeft,
      certificateNo: input.certificateNo ?? "",
      traceability: input.traceability ?? "",
    },
    today(ctx),
  );
  if (errors.length) throw badRequest(errors.join(" "));
  const file = input.evidenceId ? await orgFile(ctx, orgId, input.evidenceId) : null;
  const history = await gaugeHistory(ctx, orgId, id);
  const newest = history[0];
  const isLatest = !newest || input.calibratedOn >= newest.calibratedOn;
  const impact = (input.impact ?? "").trim();
  const calId = newId("gca");
  await ctx.db.insert(gaugeCalibration).values({
    id: calId,
    orgId,
    gaugeId: id,
    calibratedOn: input.calibratedOn,
    performer: input.performer,
    performedBy: input.performedBy.trim(),
    asFound: input.asFound,
    asLeft: input.asLeft,
    readings: input.readings ?? "",
    certificateNo: input.certificateNo ?? "",
    traceability: input.traceability ?? "",
    intervalMonths: g.intervalMonths,
    dueOn:
      g.intervalMonths !== null && input.asLeft !== "removed"
        ? nextDue(input.calibratedOn, g.intervalMonths)
        : null,
    evidenceId: file?.id ?? null,
    fileName: file?.fileName ?? null,
    fileSha256: file?.sha256 ?? null,
    impact: input.asFound === "out_of_tolerance" ? impact : "",
    impactOn: input.asFound === "out_of_tolerance" && impact ? today(ctx) : null,
    correctiveActionRef: input.correctiveActionRef ?? "",
    recordedBy: actorUserId,
  });
  if (isLatest) {
    const status = statusAfterCalibration(g.status, input.asLeft);
    if (status !== g.status)
      await ctx.db
        .update(gauge)
        .set({ status })
        .where(and(eq(gauge.id, id), eq(gauge.orgId, orgId)));
  }
  await record(ctx, orgId, actorUserId, "calibrate", id);
  return { gauge: await getGauge(ctx, orgId, id), history: await gaugeHistory(ctx, orgId, id) };
}

/**
 * The impact record of an out-of-tolerance result: what was measured with the gauge since its last
 * good calibration, whether parts were affected, and the corrective action raised, if any.
 */
export async function recordImpact(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  gaugeId: string,
  calibrationId: string,
  input: { impact: string; correctiveActionRef?: string },
) {
  await assertQualityPlan(ctx, orgId);
  await getGauge(ctx, orgId, gaugeId);
  const cal = await ctx.db
    .select()
    .from(gaugeCalibration)
    .where(
      and(
        eq(gaugeCalibration.id, calibrationId),
        eq(gaugeCalibration.gaugeId, gaugeId),
        eq(gaugeCalibration.orgId, orgId),
      ),
    )
    .get();
  if (!cal) throw notFound("Calibration");
  if (cal.asFound !== "out_of_tolerance")
    throw conflict("Only a calibration found out of tolerance needs an impact record.");
  const impact = input.impact.trim();
  if (!impact) throw badRequest("Say what was checked and what was found.");
  await ctx.db
    .update(gaugeCalibration)
    .set({
      impact,
      impactOn: today(ctx),
      correctiveActionRef: input.correctiveActionRef ?? cal.correctiveActionRef,
    })
    .where(and(eq(gaugeCalibration.id, calibrationId), eq(gaugeCalibration.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "impact", gaugeId);
  return gaugeHistory(ctx, orgId, gaugeId);
}
