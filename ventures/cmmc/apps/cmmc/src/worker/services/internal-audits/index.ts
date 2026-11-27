// ISO 9001 internal audits (clause 9.2) and corrective actions (clause 10.2): the audit programme,
// each audit's findings, and the corrective-action log a nonconformity opens. Rows are tenant-scoped
// (every query filters by orgId) and every write is audited. Reading works on every plan, as the
// ISO 9001 checklist does; recording needs the quality plan (assertQualityPlan). The checks are
// pure, in @shared/internal-audits.
import {
  type AuditFields,
  auditTiming,
  type CaSource,
  caIssues,
  caStage,
  checkProgramme,
  clauseCoverage,
  type FindingKind,
  isNonconformity,
  MAX_AUDITS_PER_ORG,
  MAX_CORRECTIVE_ACTIONS_PER_ORG,
  MAX_FINDINGS_PER_AUDIT,
  nextCaRef,
  qualityAttention,
  qualityDueDates,
  suggestedVerifyDue,
  validateAuditFields,
  validateCaDates,
  validateCompletion,
  validateVerification,
} from "@shared/internal-audits";
import { ISO9001_CLAUSES, qualityClauseById } from "@shared/quality";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  auditFinding,
  correctiveAction,
  internalAudit,
  qualityClauseRecord,
  user,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";
import { isMember } from "../orgs";

export type AuditRow = typeof internalAudit.$inferSelect;
export type FindingRow = typeof auditFinding.$inferSelect;
export type CorrectiveActionRow = typeof correctiveAction.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);
const CLAUSE_IDS = ISO9001_CLAUSES.map((c) => c.id);
export const clauseNumber = (id: string) => qualityClauseById(id)?.number ?? id;
const knownClause = (id: string) => qualityClauseById(id) !== undefined;

const record = (
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  action: string,
  targetType: string,
  id: string,
) => audit(ctx, { orgId, actorUserId, action, targetType, targetId: id });

async function assertMember(
  ctx: AppContext,
  orgId: string,
  userId: string | null | undefined,
  what: string,
) {
  if (userId && !(await isMember(ctx, orgId, userId)))
    throw badRequest(`${what} must be a member of this organization.`);
}

async function nameOf(ctx: AppContext, userId: string) {
  const u = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
  return u?.name ?? "";
}

function fail(errors: string[]) {
  if (errors.length) throw badRequest(errors.join(" "), { errors });
}

// ---------- reading ----------

async function loadAll(ctx: AppContext, orgId: string) {
  const [audits, findings, actions, clauses] = await Promise.all([
    ctx.db
      .select()
      .from(internalAudit)
      .where(eq(internalAudit.orgId, orgId))
      .orderBy(desc(internalAudit.plannedOn))
      .all(),
    ctx.db
      .select()
      .from(auditFinding)
      .where(eq(auditFinding.orgId, orgId))
      .orderBy(asc(auditFinding.createdAt))
      .all(),
    ctx.db
      .select()
      .from(correctiveAction)
      .where(eq(correctiveAction.orgId, orgId))
      .orderBy(desc(correctiveAction.ref))
      .all(),
    ctx.db
      .select({
        clauseId: qualityClauseRecord.clauseId,
        status: qualityClauseRecord.status,
        ownerUserId: qualityClauseRecord.ownerUserId,
      })
      .from(qualityClauseRecord)
      .where(eq(qualityClauseRecord.orgId, orgId))
      .all(),
  ]);
  return { audits, findings, actions, clauses };
}

export async function listCorrectiveActions(ctx: AppContext, orgId: string) {
  return ctx.db
    .select()
    .from(correctiveAction)
    .where(eq(correctiveAction.orgId, orgId))
    .orderBy(asc(correctiveAction.ref))
    .all();
}

/** The Audits tab: the programme, each audit's findings, the corrective-action log and the checks. */
export async function auditProgramme(ctx: AppContext, orgId: string) {
  const { audits, findings, actions, clauses } = await loadAll(ctx, orgId);
  const on = today(ctx);
  const caByFinding = new Map(
    actions.filter((a) => a.findingId).map((a) => [a.findingId as string, a]),
  );
  const findingsWithCa = findings.map((f) => {
    const ca = caByFinding.get(f.id);
    return { ...f, correctiveActionId: ca?.id ?? null, correctiveActionRef: ca?.ref ?? null };
  });
  const owners = new Map(clauses.map((c) => [c.clauseId, c.ownerUserId]));
  const excluded = new Set(
    clauses.filter((c) => c.status === "not_applicable").map((c) => c.clauseId),
  );
  const check = checkProgramme({
    audits,
    findings: findingsWithCa,
    actions,
    clauseIds: CLAUSE_IDS,
    excluded,
    clauseOwner: (id) => owners.get(id) ?? null,
    clauseNumber,
    today: on,
  });
  return {
    today: on,
    audits: audits.map((a) => ({
      ...a,
      timing: auditTiming(a, on),
      findings: findingsWithCa.filter((f) => f.auditId === a.id),
    })),
    correctiveActions: actions.map((ca) => ({
      ...ca,
      stage: caStage(ca),
      issues: caIssues(ca, on),
      auditId: findings.find((f) => f.id === ca.findingId)?.auditId ?? null,
    })),
    coverage: clauseCoverage(CLAUSE_IDS, audits, excluded, on),
    check,
    attention: qualityAttention(audits, actions, on),
  };
}

/** Planned audits and corrective-action dates for the calendar file and link: counts, no titles. */
export async function qualityDueDatesFor(ctx: AppContext, orgId: string) {
  const [audits, actions] = await Promise.all([
    ctx.db
      .select({ status: internalAudit.status, plannedOn: internalAudit.plannedOn })
      .from(internalAudit)
      .where(eq(internalAudit.orgId, orgId))
      .all(),
    listCorrectiveActions(ctx, orgId),
  ]);
  return qualityDueDates(audits, actions);
}

async function getAudit(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(internalAudit)
    .where(and(eq(internalAudit.id, id), eq(internalAudit.orgId, orgId)))
    .get();
  if (!row) throw notFound("Audit");
  return row;
}

async function getFinding(ctx: AppContext, orgId: string, auditId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(auditFinding)
    .where(
      and(
        eq(auditFinding.id, id),
        eq(auditFinding.orgId, orgId),
        eq(auditFinding.auditId, auditId),
      ),
    )
    .get();
  if (!row) throw notFound("Finding");
  return row;
}

async function getCa(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(correctiveAction)
    .where(and(eq(correctiveAction.id, id), eq(correctiveAction.orgId, orgId)))
    .get();
  if (!row) throw notFound("Corrective action");
  return row;
}

// ---------- audits ----------

export interface AuditInput {
  title: string;
  clauseIds?: string[];
  process?: string;
  plannedOn: string;
  auditorUserId?: string | null;
  auditorName?: string;
}

const auditFieldsOf = (r: AuditInput | AuditRow): AuditFields => ({
  title: r.title,
  clauseIds: r.clauseIds ?? [],
  process: r.process ?? "",
  plannedOn: r.plannedOn,
  auditorUserId: r.auditorUserId ?? null,
  auditorName: r.auditorName ?? "",
});

export async function createAudit(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: AuditInput,
) {
  await assertQualityPlan(ctx, orgId);
  const fields = auditFieldsOf(input);
  fail(validateAuditFields(fields, knownClause));
  await assertMember(ctx, orgId, fields.auditorUserId, "The auditor");
  const existing = await ctx.db
    .select({ n: count() })
    .from(internalAudit)
    .where(eq(internalAudit.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_AUDITS_PER_ORG)
    throw conflict(`An audit programme holds at most ${MAX_AUDITS_PER_ORG} audits.`);
  const id = newId("iau");
  await ctx.db.insert(internalAudit).values({
    id,
    orgId,
    ...fields,
    auditorName:
      fields.auditorUserId && !fields.auditorName.trim()
        ? await nameOf(ctx, fields.auditorUserId)
        : fields.auditorName.trim(),
  });
  await record(ctx, orgId, actorUserId, "internal_audit.create", "internal_audit", id);
  return getAudit(ctx, orgId, id);
}

export async function updateAudit(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<AuditInput> & { summary?: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getAudit(ctx, orgId, id);
  const merged = { ...row, ...patch };
  fail(validateAuditFields(auditFieldsOf(merged), knownClause));
  await assertMember(ctx, orgId, patch.auditorUserId, "The auditor");
  const set: Partial<AuditRow> = { ...patch };
  if (patch.auditorUserId && patch.auditorName === undefined)
    set.auditorName = await nameOf(ctx, patch.auditorUserId);
  await ctx.db
    .update(internalAudit)
    .set(set)
    .where(and(eq(internalAudit.id, id), eq(internalAudit.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "internal_audit.update", "internal_audit", id);
  return getAudit(ctx, orgId, id);
}

/** Marks a planned audit done, with the date and a summary of what was covered. */
export async function completeAudit(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: { completedOn: string; summary?: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getAudit(ctx, orgId, id);
  if (row.status !== "planned")
    throw conflict(
      row.status === "done" ? "This audit is already marked done." : "This audit was cancelled.",
    );
  fail(validateCompletion(input.completedOn, today(ctx)));
  await ctx.db
    .update(internalAudit)
    .set({
      status: "done",
      completedOn: input.completedOn,
      summary: input.summary?.trim() ?? row.summary,
    })
    .where(and(eq(internalAudit.id, id), eq(internalAudit.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "internal_audit.complete", "internal_audit", id);
  return getAudit(ctx, orgId, id);
}

/** Cancels a planned audit (kept on the programme, so the plan's history reads true). */
export async function cancelAudit(ctx: AppContext, orgId: string, actorUserId: string, id: string) {
  await assertQualityPlan(ctx, orgId);
  const row = await getAudit(ctx, orgId, id);
  if (row.status !== "planned") throw conflict("Only a planned audit can be cancelled.");
  await ctx.db
    .update(internalAudit)
    .set({ status: "cancelled" })
    .where(and(eq(internalAudit.id, id), eq(internalAudit.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "internal_audit.cancel", "internal_audit", id);
  return getAudit(ctx, orgId, id);
}

/**
 * Deletes an audit entered by mistake. One whose findings opened corrective actions is kept, so the
 * log still shows where each action came from.
 */
export async function deleteAudit(ctx: AppContext, orgId: string, actorUserId: string, id: string) {
  await assertQualityPlan(ctx, orgId);
  await getAudit(ctx, orgId, id);
  const linked = await ctx.db
    .select({ id: correctiveAction.id })
    .from(correctiveAction)
    .innerJoin(auditFinding, eq(auditFinding.id, correctiveAction.findingId))
    .where(and(eq(correctiveAction.orgId, orgId), eq(auditFinding.auditId, id)))
    .get();
  if (linked)
    throw conflict(
      "This audit's findings opened corrective actions, so it is kept for the record. Cancel it instead if it did not happen.",
    );
  await ctx.db
    .delete(internalAudit)
    .where(and(eq(internalAudit.id, id), eq(internalAudit.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "internal_audit.delete", "internal_audit", id);
}

// ---------- findings ----------

export interface FindingInput {
  kind: FindingKind;
  clauseId?: string | null;
  description: string;
  evidence?: string;
}

export async function addFinding(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  auditId: string,
  input: FindingInput,
) {
  await assertQualityPlan(ctx, orgId);
  const a = await getAudit(ctx, orgId, auditId);
  if (a.status === "cancelled") throw conflict("A cancelled audit has no findings.");
  if (!input.description.trim()) throw badRequest("Describe the finding.");
  if (input.clauseId && !knownClause(input.clauseId)) throw badRequest("Unknown clause.");
  const n = await ctx.db
    .select({ n: count() })
    .from(auditFinding)
    .where(and(eq(auditFinding.orgId, orgId), eq(auditFinding.auditId, auditId)))
    .get();
  if ((n?.n ?? 0) >= MAX_FINDINGS_PER_AUDIT)
    throw conflict(`An audit holds at most ${MAX_FINDINGS_PER_AUDIT} findings.`);
  const id = newId("afn");
  await ctx.db.insert(auditFinding).values({
    id,
    orgId,
    auditId,
    kind: input.kind,
    clauseId: input.clauseId ?? null,
    description: input.description.trim(),
    evidence: input.evidence?.trim() ?? "",
  });
  await record(ctx, orgId, actorUserId, "internal_audit.finding_add", "audit_finding", id);
  return getFinding(ctx, orgId, auditId, id);
}

export async function deleteFinding(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  auditId: string,
  id: string,
) {
  await assertQualityPlan(ctx, orgId);
  await getFinding(ctx, orgId, auditId, id);
  const linked = await ctx.db
    .select({ ref: correctiveAction.ref })
    .from(correctiveAction)
    .where(and(eq(correctiveAction.orgId, orgId), eq(correctiveAction.findingId, id)))
    .get();
  if (linked) throw conflict(`This finding opened ${linked.ref}, so it is kept for the record.`);
  await ctx.db
    .delete(auditFinding)
    .where(and(eq(auditFinding.id, id), eq(auditFinding.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "internal_audit.finding_delete", "audit_finding", id);
}

// ---------- corrective actions ----------

export interface CaInput {
  source: CaSource;
  clauseId?: string | null;
  nonconformity: string;
  containment?: string;
  rootCause?: string;
  action?: string;
  ownerUserId?: string | null;
  raisedOn: string;
  dueOn?: string | null;
  completedOn?: string | null;
  verifyDueOn?: string | null;
}

async function insertCa(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: CaInput,
  findingId: string | null,
) {
  if (!input.nonconformity.trim()) throw badRequest("Describe the nonconformity.");
  if (input.clauseId && !knownClause(input.clauseId)) throw badRequest("Unknown clause.");
  const dates = {
    raisedOn: input.raisedOn,
    dueOn: input.dueOn ?? null,
    completedOn: input.completedOn ?? null,
    verifyDueOn: input.verifyDueOn ?? null,
  };
  fail(validateCaDates(dates, today(ctx)));
  if (dates.completedOn && !input.rootCause?.trim())
    throw badRequest("Record the root cause before marking the action done.");
  await assertMember(ctx, orgId, input.ownerUserId, "The owner");
  const refs = await ctx.db
    .select({ ref: correctiveAction.ref })
    .from(correctiveAction)
    .where(eq(correctiveAction.orgId, orgId))
    .all();
  if (refs.length >= MAX_CORRECTIVE_ACTIONS_PER_ORG)
    throw conflict(`The log holds at most ${MAX_CORRECTIVE_ACTIONS_PER_ORG} corrective actions.`);
  const id = newId("cap");
  await ctx.db.insert(correctiveAction).values({
    id,
    orgId,
    ref: nextCaRef(refs.map((r) => r.ref)),
    source: input.source,
    findingId,
    clauseId: input.clauseId ?? null,
    nonconformity: input.nonconformity.trim(),
    containment: input.containment?.trim() ?? "",
    rootCause: input.rootCause?.trim() ?? "",
    action: input.action?.trim() ?? "",
    ownerUserId: input.ownerUserId ?? null,
    ...dates,
    verifyDueOn:
      dates.verifyDueOn ?? (dates.completedOn ? suggestedVerifyDue(dates.completedOn) : null),
  });
  await record(ctx, orgId, actorUserId, "corrective_action.create", "corrective_action", id);
  return getCa(ctx, orgId, id);
}

export async function createCorrectiveAction(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: CaInput,
) {
  await assertQualityPlan(ctx, orgId);
  return insertCa(ctx, orgId, actorUserId, input, null);
}

/**
 * Opens a corrective action from an audit finding: the source, clause and nonconformity come from
 * the finding, raised on the audit's date. One action per finding.
 */
export async function openFromFinding(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  auditId: string,
  findingId: string,
  input: { ownerUserId?: string | null; dueOn?: string | null; containment?: string },
) {
  await assertQualityPlan(ctx, orgId);
  const a = await getAudit(ctx, orgId, auditId);
  const f = await getFinding(ctx, orgId, auditId, findingId);
  const existing = await ctx.db
    .select({ ref: correctiveAction.ref })
    .from(correctiveAction)
    .where(and(eq(correctiveAction.orgId, orgId), eq(correctiveAction.findingId, findingId)))
    .get();
  if (existing) throw conflict(`This finding already opened ${existing.ref}.`);
  const on = today(ctx);
  // The audit date, or today when the audit is still planned for later (a date raised is never future).
  const raisedOn = a.completedOn ?? ([a.plannedOn, on].sort()[0] as string);
  return insertCa(
    ctx,
    orgId,
    actorUserId,
    {
      source: "internal_audit",
      clauseId: f.clauseId,
      nonconformity: `${isNonconformity(f.kind) ? "" : "(from an observation) "}${f.description}${f.evidence ? `\nSeen: ${f.evidence}` : ""}`,
      raisedOn,
      ...input,
    },
    findingId,
  );
}

/**
 * Edits a corrective action. A closed one is kept as it was closed. Changing the action or the date
 * it was done after a check found it did not work starts a new attempt: the old check is cleared
 * (its notes kept at the top of the verification notes) so the new action is checked in turn.
 */
export async function updateCorrectiveAction(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<CaInput>,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getCa(ctx, orgId, id);
  if (row.closedOn) throw conflict("A closed corrective action is kept as it was closed.");
  const merged = { ...row, ...patch };
  if (!merged.nonconformity.trim()) throw badRequest("Describe the nonconformity.");
  if (patch.clauseId && !knownClause(patch.clauseId)) throw badRequest("Unknown clause.");
  fail(
    validateCaDates(
      {
        raisedOn: merged.raisedOn,
        dueOn: merged.dueOn ?? null,
        completedOn: merged.completedOn ?? null,
        verifyDueOn: merged.verifyDueOn ?? null,
      },
      today(ctx),
    ),
  );
  if (merged.completedOn && !merged.rootCause.trim())
    throw badRequest("Record the root cause before marking the action done.");
  await assertMember(ctx, orgId, patch.ownerUserId, "The owner");
  const set: Partial<CorrectiveActionRow> = { ...patch };
  const retried =
    row.effective === false &&
    ((patch.action !== undefined && patch.action !== row.action) ||
      (patch.completedOn !== undefined && patch.completedOn !== row.completedOn));
  if (retried) {
    set.verifiedOn = null;
    set.verifiedByName = "";
    set.effective = null;
    set.verificationNotes = `Earlier check ${row.verifiedOn}: not effective. ${row.verificationNotes}`;
    if (patch.verifyDueOn === undefined) set.verifyDueOn = null;
  }
  if (
    set.completedOn &&
    set.completedOn !== row.completedOn &&
    patch.verifyDueOn === undefined &&
    (retried || !row.verifyDueOn)
  )
    set.verifyDueOn = suggestedVerifyDue(set.completedOn);
  await ctx.db
    .update(correctiveAction)
    .set(set)
    .where(and(eq(correctiveAction.id, id), eq(correctiveAction.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "corrective_action.update", "corrective_action", id);
  return getCa(ctx, orgId, id);
}

/**
 * Records the check that the action worked. Effective closes the action on the check's date; not
 * effective keeps it open, and a new action is recorded with updateCorrectiveAction.
 */
export async function verifyCorrectiveAction(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: { checkedOn: string; effective: boolean; notes: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getCa(ctx, orgId, id);
  fail(validateVerification(row, input, today(ctx)));
  const previous = row.verificationNotes ? `${row.verificationNotes}\n` : "";
  await ctx.db
    .update(correctiveAction)
    .set({
      verifiedOn: input.checkedOn,
      verifiedByName: await nameOf(ctx, actorUserId),
      effective: input.effective,
      verificationNotes: `${previous}${input.notes.trim()}`,
      closedOn: input.effective ? input.checkedOn : null,
    })
    .where(and(eq(correctiveAction.id, id), eq(correctiveAction.orgId, orgId)));
  await record(
    ctx,
    orgId,
    actorUserId,
    input.effective ? "corrective_action.close" : "corrective_action.not_effective",
    "corrective_action",
    id,
  );
  return getCa(ctx, orgId, id);
}

/** Deletes an open corrective action entered by mistake; closed ones are kept for the record. */
export async function deleteCorrectiveAction(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getCa(ctx, orgId, id);
  if (row.closedOn) throw conflict("A closed corrective action is kept for the record.");
  await ctx.db
    .delete(correctiveAction)
    .where(and(eq(correctiveAction.id, id), eq(correctiveAction.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "corrective_action.delete", "corrective_action", id);
}
