// Per-org control records layered over the static library (src/shared/controls).
import {
  type CmmcLevel,
  CONTROLS,
  type ControlDef,
  type ControlState,
  controlById,
  type ImplementationStatus,
  PARTIAL_CREDIT_RULES,
  type PartialCreditKey,
} from "@shared/controls";
import type { ObjectiveResult } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlRecord } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { isMember } from "../orgs";

export type ControlRecordRow = typeof controlRecord.$inferSelect;

export interface ControlView extends ControlDef {
  record: ControlRecordRow | null;
}

export function requireControl(controlId: string): ControlDef {
  const def = controlById(controlId);
  if (!def) throw notFound("Control");
  return def;
}

export async function recordsFor(ctx: AppContext, orgId: string) {
  return ctx.db.select().from(controlRecord).where(eq(controlRecord.orgId, orgId)).all();
}

export async function listControls(
  ctx: AppContext,
  orgId: string,
  level: CmmcLevel,
): Promise<ControlView[]> {
  const rows = await recordsFor(ctx, orgId);
  const byId = new Map(rows.map((r) => [r.controlId, r]));
  return CONTROLS[level].map((def) => ({ ...def, record: byId.get(def.id) ?? null }));
}

export async function getRecord(ctx: AppContext, orgId: string, controlId: string) {
  return (
    (await ctx.db
      .select()
      .from(controlRecord)
      .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, controlId)))
      .get()) ?? null
  );
}

/** Creates the org's record for a control on first write. */
export async function ensureRecord(ctx: AppContext, orgId: string, controlId: string) {
  requireControl(controlId);
  await ctx.db
    .insert(controlRecord)
    .values({ id: newId("ctl"), orgId, controlId })
    .onConflictDoNothing();
  const row = await getRecord(ctx, orgId, controlId);
  if (!row) throw notFound("Control");
  return row;
}

export interface ControlPatch {
  status?: ImplementationStatus;
  partialCredit?: PartialCreditKey | null;
  ownerUserId?: string | null;
  notes?: string;
  statement?: string;
  draftStatement?: string | null;
  objectiveResults?: Record<string, ObjectiveResult>;
}

export async function updateControl(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  controlId: string,
  patch: ControlPatch,
) {
  const def = requireControl(controlId);
  if (patch.partialCredit) {
    const ok = PARTIAL_CREDIT_RULES.some(
      (r) => r.key === patch.partialCredit && def.level === 2 && def.nistIds.includes(r.nistId),
    );
    if (!ok) throw badRequest("That partial-credit option does not apply to this requirement");
  }
  if (patch.ownerUserId && !(await isMember(ctx, orgId, patch.ownerUserId))) {
    throw badRequest("Owner must be a member of this organization");
  }
  if (patch.objectiveResults) {
    const known = new Set(def.objectives.map((o) => o.id));
    for (const k of Object.keys(patch.objectiveResults)) {
      if (!known.has(k)) throw badRequest(`Unknown objective ${k} for ${controlId}`);
    }
  }
  const existing = await ensureRecord(ctx, orgId, controlId);
  const set: Partial<typeof controlRecord.$inferInsert> = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.partialCredit !== undefined) set.partialCredit = patch.partialCredit;
  // Partial credit only means something on a partially implemented requirement.
  const nextStatus = patch.status ?? existing.status;
  if (nextStatus !== "partially_implemented") set.partialCredit = null;
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.statement !== undefined) {
    set.statement = patch.statement;
    set.statementUpdatedBy = actorUserId;
    set.statementUpdatedAt = ctx.now();
  }
  if (patch.draftStatement !== undefined) set.draftStatement = patch.draftStatement;
  if (patch.objectiveResults !== undefined) {
    set.objectiveResults = { ...(existing.objectiveResults ?? {}), ...patch.objectiveResults };
  }
  await ctx.db
    .update(controlRecord)
    .set(set)
    .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, controlId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "control.update",
    targetType: "control",
    targetId: controlId,
  });
  return getRecord(ctx, orgId, controlId);
}

/** Accept the AI draft (optionally edited by the user) as the implementation statement. */
export async function acceptDraft(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  controlId: string,
  editedText?: string,
) {
  requireControl(controlId);
  const rec = await getRecord(ctx, orgId, controlId);
  const text = editedText ?? rec?.draftStatement;
  if (!text?.trim()) throw badRequest("There is no draft to accept");
  await ctx.db
    .update(controlRecord)
    .set({
      statement: text,
      statementUpdatedBy: actorUserId,
      statementUpdatedAt: ctx.now(),
      draftStatement: null,
      draftQuestions: null,
      draftGeneratedAt: null,
    })
    .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, controlId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "control.draft_accept",
    targetType: "control",
    targetId: controlId,
  });
  return getRecord(ctx, orgId, controlId);
}

/** Scoring input: CMMC id -> state, for the org's records. */
export function statesFrom(rows: ControlRecordRow[]): Map<string, ControlState> {
  return new Map(
    rows.map((r) => [r.controlId, { status: r.status, partialCredit: r.partialCredit }]),
  );
}
