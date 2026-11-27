// SPRS affirmation record (32 CFR 170.22): what the affirming official entered in SPRS and when,
// and the dates the next affirmation and self-assessment fall due (src/shared/affirmation.ts).
// The app records the user's own submission; it never submits anything to SPRS.
import {
  type AffirmationDto,
  type AffirmationInput,
  type AffirmationsResponse,
  affirmationSchedule,
  validateAffirmation,
} from "@shared/affirmation";
import { scoreLevel2 } from "@shared/controls";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { affirmation, user } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { recordsFor, statesFrom } from "../controls";

export const todayIn = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export async function listAffirmations(
  ctx: AppContext,
  orgId: string,
): Promise<AffirmationsResponse> {
  const rows = await ctx.db
    .select({ a: affirmation, recordedByName: user.name })
    .from(affirmation)
    .leftJoin(user, eq(user.id, affirmation.recordedBy))
    .where(eq(affirmation.orgId, orgId))
    .orderBy(desc(affirmation.affirmedOn), desc(affirmation.createdAt))
    .all();
  const items: AffirmationDto[] = rows.map(({ a, recordedByName }) => ({
    id: a.id,
    level: a.level,
    kind: a.kind,
    cmmcStatus: a.cmmcStatus,
    cmmcStatusDate: a.cmmcStatusDate,
    affirmedOn: a.affirmedOn,
    officialName: a.officialName,
    officialTitle: a.officialTitle,
    officialContact: a.officialContact,
    sprsScore: a.sprsScore,
    workspaceScore: a.workspaceScore,
    notes: a.notes,
    recordedByName: recordedByName ?? null,
    createdAt: a.createdAt.toISOString(),
  }));
  const today = todayIn(ctx);
  return {
    items,
    schedules: [affirmationSchedule(items, 1, today), affirmationSchedule(items, 2, today)],
    today,
  };
}

export async function createAffirmation(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: AffirmationInput & { notes?: string },
) {
  const errors = validateAffirmation(input, todayIn(ctx));
  if (errors.length) throw badRequest(errors.join(" "), { errors });
  // Kept beside the user's figure so a later reader can see whether SPRS and the workspace agreed.
  const workspaceScore =
    input.level === 2 ? scoreLevel2(statesFrom(await recordsFor(ctx, orgId))).score : null;
  const id = newId("aff");
  await ctx.db.insert(affirmation).values({
    id,
    orgId,
    level: input.level,
    kind: input.kind,
    cmmcStatus: input.cmmcStatus,
    cmmcStatusDate: input.cmmcStatusDate,
    affirmedOn: input.affirmedOn,
    officialName: input.officialName.trim(),
    officialTitle: input.officialTitle.trim(),
    officialContact: input.officialContact.trim(),
    sprsScore: input.level === 2 ? input.sprsScore : null,
    workspaceScore,
    notes: input.notes ?? "",
    recordedBy: actorUserId,
  });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "affirmation.create",
    targetType: "affirmation",
    targetId: id,
  });
  const out = (await listAffirmations(ctx, orgId)).items.find((i) => i.id === id);
  if (!out) throw notFound("Affirmation");
  return out;
}

/** For a record made in error. The audit log keeps that it existed and who removed it. */
export async function deleteAffirmation(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  const where = and(eq(affirmation.orgId, orgId), eq(affirmation.id, id));
  const row = await ctx.db.select({ id: affirmation.id }).from(affirmation).where(where).get();
  if (!row) throw notFound("Affirmation");
  await ctx.db.delete(affirmation).where(where);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "affirmation.delete",
    targetType: "affirmation",
    targetId: id,
  });
}
