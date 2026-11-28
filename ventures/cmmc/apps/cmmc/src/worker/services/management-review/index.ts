// ISO 9001 management review (clause 9.3). Rows are tenant-scoped; every write is audited. Reading
// works on every plan; recording needs the Level 2 + Quality plan, like the rest of the ISO 9001
// side. A draft's figures are worked out from the org's records each time it is read; finalising
// checks the minutes are complete, keeps the figures as they stood, and freezes the record except
// each action's done date. The rules are pure, in @shared/management-review.
import { calState } from "@shared/calibration";
import {
  defaultPeriod,
  type FactsInput,
  finaliseProblems,
  MAX_REVIEWS_PER_ORG,
  type ReviewAction,
  type ReviewFacts,
  type ReviewFields,
  type ReviewInputKey,
  type ReviewOutputKey,
  reviewAttention,
  reviewFacts,
  reviewMinutesMarkdown,
  validateReview,
} from "@shared/management-review";
import { supplierIssues } from "@shared/suppliers";
import { and, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  auditFinding,
  correctiveAction,
  gaugeCalibration,
  incident,
  internalAudit,
  managementReview,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";
import { gaugeList } from "../calibration";
import { getOrg } from "../orgs";
import { listSuppliers } from "../suppliers";

export type ReviewRow = typeof managementReview.$inferSelect;

export interface ReviewInput {
  heldOn: string;
  periodFrom?: string;
  periodTo?: string;
  attendees?: string;
  inputs?: Partial<Record<ReviewInputKey, string>>;
  outputs?: Partial<Record<ReviewOutputKey, string>>;
  actions?: (Omit<ReviewAction, "id"> & { id?: string })[];
  nextReviewOn?: string | null;
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
    action: `management_review.${action}`,
    targetType: "management_review",
    targetId: id,
  });
}

async function listRows(ctx: AppContext, orgId: string): Promise<ReviewRow[]> {
  return ctx.db
    .select()
    .from(managementReview)
    .where(eq(managementReview.orgId, orgId))
    .orderBy(desc(managementReview.heldOn), desc(managementReview.createdAt))
    .all();
}

export async function getReview(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(managementReview)
    .where(and(eq(managementReview.id, id), eq(managementReview.orgId, orgId)))
    .get();
  if (!row) throw notFound("Management review");
  return row;
}

const fieldsOf = (r: ReviewRow): ReviewFields => ({
  heldOn: r.heldOn,
  periodFrom: r.periodFrom,
  periodTo: r.periodTo,
  attendees: r.attendees,
  inputs: r.inputs,
  outputs: r.outputs,
  actions: r.actions,
  nextReviewOn: r.nextReviewOn,
});

/** The final review held before this one, whose actions this one reads. */
function previousFinal(rows: readonly ReviewRow[], r: Pick<ReviewRow, "id" | "heldOn">) {
  return (
    rows.find((x) => x.status === "final" && x.id !== r.id && x.heldOn < r.heldOn) ??
    rows.find((x) => x.status === "final" && x.id !== r.id && x.heldOn === r.heldOn) ??
    null
  );
}

/** Everything the figures are worked out from, read once for all the drafts on a page. */
async function loadRecords(ctx: AppContext, orgId: string) {
  const on = today(ctx);
  const [cas, audits, findings, gauges, cals, suppliers, incidents] = await Promise.all([
    ctx.db.select().from(correctiveAction).where(eq(correctiveAction.orgId, orgId)).all(),
    ctx.db.select().from(internalAudit).where(eq(internalAudit.orgId, orgId)).all(),
    ctx.db
      .select({ kind: auditFinding.kind, auditId: auditFinding.auditId })
      .from(auditFinding)
      .where(eq(auditFinding.orgId, orgId))
      .all(),
    gaugeList(ctx, orgId),
    ctx.db
      .select({
        calibratedOn: gaugeCalibration.calibratedOn,
        asFound: gaugeCalibration.asFound,
        impact: gaugeCalibration.impact,
      })
      .from(gaugeCalibration)
      .where(eq(gaugeCalibration.orgId, orgId))
      .all(),
    listSuppliers(ctx, orgId),
    ctx.db
      .select({ discoveredAt: incident.discoveredAt, closedOn: incident.closedOn })
      .from(incident)
      .where(eq(incident.orgId, orgId))
      .all(),
  ]);
  const auditOn = new Map(audits.map((a) => [a.id, a.completedOn ?? a.plannedOn]));
  return {
    today: on,
    correctiveActions: cas,
    audits,
    findings: findings.map((f) => ({ kind: f.kind, auditOn: auditOn.get(f.auditId) ?? "" })),
    gauges: gauges.items.map((g) => ({
      tag: g.tag,
      inUse: calState(g, on) !== "not_in_use",
      dueOn: g.dueOn,
    })),
    calibrations: cals.map((c) => ({
      calibratedOn: c.calibratedOn,
      asFound: c.asFound,
      impactRecorded: !!c.impact.trim(),
    })),
    suppliers: suppliers.map((s) => ({
      name: s.name,
      gaps: supplierIssues(s, on).filter((i) => i.kind === "gap").length,
    })),
    incidents: incidents.map((i) => ({
      discoveredOn: i.discoveredAt.slice(0, 10),
      closedOn: i.closedOn,
    })),
  } satisfies Omit<FactsInput, "periodFrom" | "periodTo" | "previous">;
}

type Records = Awaited<ReturnType<typeof loadRecords>>;

function factsFor(r: ReviewRow, rows: readonly ReviewRow[], records: Records): ReviewFacts {
  if (r.status === "final" && r.facts) return r.facts;
  const prev = previousFinal(rows, r);
  return reviewFacts({
    ...records,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    previous: prev ? { heldOn: prev.heldOn, actions: prev.actions } : null,
  });
}

function describe(r: ReviewRow, facts: ReviewFacts, on: string) {
  return {
    ...r,
    facts,
    problems: r.status === "draft" ? finaliseProblems(fieldsOf(r), facts, on) : [],
  };
}

/** The Reviews tab: every review with its figures, what blocks each draft, and the next due date. */
export async function reviewList(ctx: AppContext, orgId: string) {
  const rows = await listRows(ctx, orgId);
  const needRecords = rows.some((r) => r.status === "draft" || !r.facts);
  const records = needRecords ? await loadRecords(ctx, orgId) : null;
  const on = today(ctx);
  return {
    today: on,
    items: rows.map((r) =>
      describe(r, records ? factsFor(r, rows, records) : (r.facts as ReviewFacts), on),
    ),
    attention: reviewAttention(rows, on),
  };
}

async function describeOne(ctx: AppContext, orgId: string, id: string) {
  const rows = await listRows(ctx, orgId);
  const r = rows.find((x) => x.id === id);
  if (!r) throw notFound("Management review");
  const facts =
    r.status === "final" && r.facts ? r.facts : factsFor(r, rows, await loadRecords(ctx, orgId));
  return describe(r, facts, today(ctx));
}

function normaliseActions(actions: ReviewInput["actions"], kept: readonly ReviewAction[] = []) {
  if (!actions) return kept.slice();
  return actions.map((a) => ({
    id: a.id && kept.some((k) => k.id === a.id) ? a.id : newId("mra"),
    text: a.text.trim(),
    owner: a.owner.trim(),
    dueOn: a.dueOn || null,
    doneOn: a.doneOn || null,
  }));
}

const trimmed = <K extends string>(o: Partial<Record<K, string>> | undefined) =>
  Object.fromEntries(
    Object.entries(o ?? {})
      .map(([k, v]) => [k, String(v ?? "").trim()])
      .filter(([, v]) => v),
  ) as Partial<Record<K, string>>;

function check(fields: ReviewFields) {
  const errors = validateReview(fields);
  if (errors.length) throw badRequest(errors.join(" "));
}

export async function createReview(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: ReviewInput,
) {
  await assertQualityPlan(ctx, orgId);
  const existing = await ctx.db
    .select({ n: count() })
    .from(managementReview)
    .where(eq(managementReview.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_REVIEWS_PER_ORG)
    throw conflict(`An organization keeps at most ${MAX_REVIEWS_PER_ORG} management reviews.`);
  const rows = await listRows(ctx, orgId);
  const last = rows.find((r) => r.status === "final" && r.heldOn <= input.heldOn) ?? null;
  const period = defaultPeriod(input.heldOn, last);
  const fields: ReviewFields = {
    heldOn: input.heldOn,
    periodFrom: input.periodFrom ?? period.periodFrom,
    periodTo: input.periodTo ?? period.periodTo,
    attendees: (input.attendees ?? "").trim(),
    inputs: trimmed(input.inputs),
    outputs: trimmed(input.outputs),
    actions: normaliseActions(input.actions),
    nextReviewOn: input.nextReviewOn ?? null,
  };
  check(fields);
  const id = newId("mrv");
  await ctx.db.insert(managementReview).values({
    id,
    orgId,
    ...fields,
    status: "draft",
    createdBy: actorUserId,
  });
  await record(ctx, orgId, actorUserId, "create", id);
  return describeOne(ctx, orgId, id);
}

export async function updateReview(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<ReviewInput>,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getReview(ctx, orgId, id);
  if (row.status === "final")
    throw conflict(
      "A finalised review is kept as recorded: mark its actions done, or start a new review.",
    );
  const fields: ReviewFields = {
    heldOn: patch.heldOn ?? row.heldOn,
    periodFrom: patch.periodFrom ?? row.periodFrom,
    periodTo: patch.periodTo ?? row.periodTo,
    attendees: patch.attendees !== undefined ? patch.attendees.trim() : row.attendees,
    inputs: patch.inputs !== undefined ? trimmed(patch.inputs) : row.inputs,
    outputs: patch.outputs !== undefined ? trimmed(patch.outputs) : row.outputs,
    actions: normaliseActions(patch.actions, row.actions),
    nextReviewOn: patch.nextReviewOn !== undefined ? patch.nextReviewOn : row.nextReviewOn,
  };
  check(fields);
  await ctx.db
    .update(managementReview)
    .set(fields)
    .where(and(eq(managementReview.id, id), eq(managementReview.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "update", id);
  return describeOne(ctx, orgId, id);
}

/** Checks the minutes are complete, then keeps them with the figures as they stand today. */
export async function finaliseReview(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await assertQualityPlan(ctx, orgId);
  const rows = await listRows(ctx, orgId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw notFound("Management review");
  if (row.status === "final") throw conflict("This review is already finalised.");
  const facts = factsFor(row, rows, await loadRecords(ctx, orgId));
  const on = today(ctx);
  const problems = finaliseProblems(fieldsOf(row), facts, on);
  if (problems.length) throw badRequest(problems.join(" "));
  await ctx.db
    .update(managementReview)
    .set({ status: "final", facts, finalisedOn: on, finalisedBy: actorUserId })
    .where(and(eq(managementReview.id, id), eq(managementReview.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "finalise", id);
  return describeOne(ctx, orgId, id);
}

/** The one write a finalised review takes: an action marked done (or undone, if marked by mistake). */
export async function setActionDone(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  actionId: string,
  doneOn: string | null,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getReview(ctx, orgId, id);
  const action = row.actions.find((a) => a.id === actionId);
  if (!action) throw notFound("Action");
  if (doneOn !== null && doneOn > today(ctx))
    throw badRequest("An action cannot be marked done on a future date.");
  const actions = row.actions.map((a) => (a.id === actionId ? { ...a, doneOn } : a));
  await ctx.db
    .update(managementReview)
    .set({ actions })
    .where(and(eq(managementReview.id, id), eq(managementReview.orgId, orgId)));
  await record(ctx, orgId, actorUserId, doneOn ? "action_done" : "action_reopened", id);
  return describeOne(ctx, orgId, id);
}

/** Only a draft can be deleted: a finalised review is the record an auditor asks for. */
export async function deleteReview(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getReview(ctx, orgId, id);
  if (row.status === "final")
    throw conflict("A finalised review is kept as the record of the meeting.");
  await ctx.db
    .delete(managementReview)
    .where(and(eq(managementReview.id, id), eq(managementReview.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "delete", id);
}

export async function reviewMinutes(ctx: AppContext, orgId: string, id: string) {
  const [r, { org }] = await Promise.all([describeOne(ctx, orgId, id), getOrg(ctx, orgId)]);
  return reviewMinutesMarkdown(r, r.facts, { orgName: org.name, generatedOn: today(ctx) });
}
