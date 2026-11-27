// Plan of Action and Milestones. Items are tied to a control; eligibility under 32 CFR 170.21 is
// computed from the control's current state, never stored, so it cannot drift.
import { type ControlState, controlById, poamEligibility } from "@shared/controls";
import type { PoamStatus } from "@shared/enums";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { poamItem } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { recordsFor, requireControl, statesFrom } from "../controls";

export type PoamRow = typeof poamItem.$inferSelect;

export interface PoamInput {
  controlId: string;
  weakness: string;
  remediation?: string;
  milestones?: string;
  responsible?: string;
  scheduledCompletion: string;
}

export function annotate(row: PoamRow, states: Map<string, ControlState>, today: string) {
  const def = controlById(row.controlId);
  const eligibility =
    def?.level === 2 && def.nistIds[0]
      ? poamEligibility(def.nistIds[0], states.get(row.controlId))
      : { eligible: false, reason: "Level 1 does not allow POA&Ms (32 CFR 170.21)" };
  return {
    ...row,
    eligible: eligibility.eligible,
    eligibilityReason: eligibility.reason,
    overdue: row.status === "open" && row.scheduledCompletion < today,
  };
}

export async function listPoam(ctx: AppContext, orgId: string) {
  const [rows, recs] = await Promise.all([
    ctx.db
      .select()
      .from(poamItem)
      .where(eq(poamItem.orgId, orgId))
      .orderBy(asc(poamItem.scheduledCompletion))
      .all(),
    recordsFor(ctx, orgId),
  ]);
  const states = statesFrom(recs);
  const today = ctx.now().toISOString().slice(0, 10);
  return rows.map((r) => annotate(r, states, today));
}

export async function createPoam(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: PoamInput,
) {
  requireControl(input.controlId);
  const id = newId("poa");
  await ctx.db.insert(poamItem).values({
    id,
    orgId,
    controlId: input.controlId,
    weakness: input.weakness,
    remediation: input.remediation ?? "",
    milestones: input.milestones ?? "",
    responsible: input.responsible ?? "",
    scheduledCompletion: input.scheduledCompletion,
  });
  await audit(ctx, { orgId, actorUserId, action: "poam.create", targetType: "poam", targetId: id });
  return getPoam(ctx, orgId, id);
}

export async function getPoam(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(poamItem)
    .where(and(eq(poamItem.id, id), eq(poamItem.orgId, orgId)))
    .get();
  if (!row) throw notFound("POA&M item");
  const states = statesFrom(await recordsFor(ctx, orgId));
  return annotate(row, states, ctx.now().toISOString().slice(0, 10));
}

export async function updatePoam(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<Omit<PoamInput, "controlId">> & { status?: PoamStatus },
) {
  const current = await getPoam(ctx, orgId, id);
  const set: Partial<typeof poamItem.$inferInsert> = { ...patch };
  if (patch.status && patch.status !== current.status)
    set.closedAt = patch.status === "closed" ? ctx.now() : null;
  await ctx.db
    .update(poamItem)
    .set(set)
    .where(and(eq(poamItem.id, id), eq(poamItem.orgId, orgId)));
  await audit(ctx, { orgId, actorUserId, action: "poam.update", targetType: "poam", targetId: id });
  return getPoam(ctx, orgId, id);
}

export async function deletePoam(ctx: AppContext, orgId: string, actorUserId: string, id: string) {
  await getPoam(ctx, orgId, id);
  await ctx.db.delete(poamItem).where(and(eq(poamItem.id, id), eq(poamItem.orgId, orgId)));
  await audit(ctx, { orgId, actorUserId, action: "poam.delete", targetType: "poam", targetId: id });
}

/** RFC 4180 CSV; cells starting with = + - @ are prefixed with ' to stop spreadsheet formula injection. */
export function poamCsv(rows: ReturnType<typeof annotate>[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Control",
    "Weakness",
    "Remediation",
    "Milestones",
    "Responsible",
    "Scheduled completion",
    "Status",
    "Overdue",
    "POA&M eligible (32 CFR 170.21)",
    "Eligibility note",
  ];
  const lines = rows.map((r) =>
    [
      r.controlId,
      r.weakness,
      r.remediation,
      r.milestones,
      r.responsible,
      r.scheduledCompletion,
      r.status,
      r.overdue ? "yes" : "no",
      r.eligible ? "yes" : "no",
      r.eligibilityReason,
    ]
      .map(cell)
      .join(","),
  );
  return `${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}
