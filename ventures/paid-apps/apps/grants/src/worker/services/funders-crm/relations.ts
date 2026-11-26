// Relations, contacts and interactions: tenant-scoped CRUD. Every query filters by orgId and
// lookups by id also match orgId. Audit metadata carries ids and field names only: contacts and
// notes are personal data.
import {
  type CreateFunderRelationInput,
  FUNDER_STAGES,
  type FunderContactDto,
  type FunderContactInput,
  type FunderContactPatch,
  type FunderInteractionDto,
  type FunderInteractionInput,
  type FunderInteractionPatch,
  type FunderListResponse,
  type FunderRelationDto,
  type FunderRelationSummaryDto,
  type FunderStage,
  type UpdateFunderRelationInput,
} from "@shared/api/funders";
import { and, count, desc, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, funders, member, opportunities, user } from "../../db/schema";
import { awards } from "../../db/schema/awards";
import {
  orgFunderContacts,
  orgFunderInteractions,
  orgFunderRelations,
} from "../../db/schema/funder-relations";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { normalizeFunderName } from "../discovery/catalog";
import { audit } from "../privacy/audit";
import { cleanTags, normalizeEin } from "./model";
import { newRelationId, syncRelations, tolerateMissingTable } from "./sync";

export type RelationRow = typeof orgFunderRelations.$inferSelect;
export type ContactRow = typeof orgFunderContacts.$inferSelect;
export type InteractionRow = typeof orgFunderInteractions.$inferSelect;

export interface Actor {
  userId: string;
  requestId?: string;
}

const suffix = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const newContactId = () => `fco_${suffix()}`;
const newInteractionId = () => `fin_${suffix()}`;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (s: string | null | undefined) =>
  s === undefined ? undefined : s === null ? null : new Date(s);

export function toRelationDto(r: RelationRow): FunderRelationDto {
  return {
    id: r.id,
    funderId: r.funderId,
    prospectEin: r.prospectEin,
    displayName: r.displayName,
    stage: r.stage,
    stageSource: r.stageSource,
    origin: r.origin,
    ownerId: r.ownerId,
    nextStepAt: iso(r.nextStepAt),
    nextStepNote: r.nextStepNote,
    tags: r.tags,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toContactDto(c: ContactRow): FunderContactDto {
  return {
    id: c.id,
    relationId: c.relationId,
    name: c.name,
    role: c.role,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    preferredContact: c.preferredContact,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toInteractionDto(
  i: InteractionRow,
  createdByName: string | null,
): FunderInteractionDto {
  return {
    id: i.id,
    relationId: i.relationId,
    contactId: i.contactId,
    kind: i.kind,
    occurredAt: i.occurredAt.toISOString(),
    summary: i.summary,
    createdBy: i.createdBy,
    createdByName,
    createdAt: i.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------------------------------ relations

export async function loadRelation(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(orgFunderRelations)
    .where(and(eq(orgFunderRelations.id, id), eq(orgFunderRelations.orgId, orgId)))
    .get();
  if (!row) throw notFound("Funder relationship");
  return row;
}

async function assertMember(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .get();
  if (!row) throw badRequest("The owner must be a member of this organization");
}

/** Per-relation application count and awarded total, matched by funderId or normalized name. */
async function pipelineTotals(ctx: AppContext, orgId: string, relations: RelationRow[]) {
  const [apps, manualAwards] = await Promise.all([
    ctx.db
      .select({
        status: applications.status,
        awardedAmountCents: applications.awardedAmountCents,
        funderId: opportunities.funderId,
        funderName: opportunities.funderName,
      })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.orgId, orgId))
      .limit(2000)
      .all(),
    tolerateMissingTable(ctx, "awards", () =>
      ctx.db
        .select({ funderName: awards.funderName, amountCents: awards.amountCents })
        .from(awards)
        .where(and(eq(awards.orgId, orgId), sql`${awards.applicationId} is null`))
        .limit(1000)
        .all(),
    ),
  ]);
  const byFunder = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of relations) {
    if (r.funderId) byFunder.set(r.funderId, r.id);
    if (!byName.has(r.normalizedName)) byName.set(r.normalizedName, r.id);
  }
  const totals = new Map<string, { applicationCount: number; awardedCents: number }>();
  const bump = (id: string | undefined, apps: number, cents: number) => {
    if (!id) return;
    const t = totals.get(id) ?? { applicationCount: 0, awardedCents: 0 };
    t.applicationCount += apps;
    t.awardedCents += cents;
    totals.set(id, t);
  };
  for (const a of apps) {
    const id =
      (a.funderId ? byFunder.get(a.funderId) : undefined) ??
      byName.get(normalizeFunderName(a.funderName));
    bump(id, 1, a.status === "awarded" ? (a.awardedAmountCents ?? 0) : 0);
  }
  for (const w of manualAwards)
    bump(byName.get(normalizeFunderName(w.funderName)), 0, w.amountCents ?? 0);
  return totals;
}

export interface ListFilter {
  stages?: FunderStage[];
  q?: string;
  ownerId?: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listRelations(
  ctx: AppContext,
  orgId: string,
  filter: ListFilter,
  canEdit: boolean,
): Promise<FunderListResponse> {
  await syncRelations(ctx, orgId);
  const conds: (SQL | undefined)[] = [eq(orgFunderRelations.orgId, orgId)];
  if (filter.stages?.length) conds.push(inArray(orgFunderRelations.stage, filter.stages));
  if (filter.ownerId) conds.push(eq(orgFunderRelations.ownerId, filter.ownerId));
  const q = filter.q?.trim();
  if (q) {
    conds.push(
      sql`${orgFunderRelations.displayName} like ${`%${escapeLike(q.slice(0, 100))}%`} escape '\\'`,
    );
  }
  const [rows, stageCounts, contactCounts, lastInteractions] = await Promise.all([
    ctx.db
      .select({ relation: orgFunderRelations, ownerName: user.name })
      .from(orgFunderRelations)
      .leftJoin(user, eq(user.id, orgFunderRelations.ownerId))
      .where(and(...conds))
      .orderBy(desc(orgFunderRelations.updatedAt), orgFunderRelations.id)
      .limit(500)
      .all(),
    ctx.db
      .select({ stage: orgFunderRelations.stage, n: count() })
      .from(orgFunderRelations)
      .where(eq(orgFunderRelations.orgId, orgId))
      .groupBy(orgFunderRelations.stage)
      .all(),
    ctx.db
      .select({ relationId: orgFunderContacts.relationId, n: count() })
      .from(orgFunderContacts)
      .where(eq(orgFunderContacts.orgId, orgId))
      .groupBy(orgFunderContacts.relationId)
      .all(),
    ctx.db
      .select({
        relationId: orgFunderInteractions.relationId,
        last: max(orgFunderInteractions.occurredAt),
      })
      .from(orgFunderInteractions)
      .where(eq(orgFunderInteractions.orgId, orgId))
      .groupBy(orgFunderInteractions.relationId)
      .all(),
  ]);
  const totals = await pipelineTotals(
    ctx,
    orgId,
    rows.map((r) => r.relation),
  );
  const contacts = new Map(contactCounts.map((c) => [c.relationId, c.n]));
  const last = new Map(lastInteractions.map((l) => [l.relationId, l.last]));
  const counts = Object.fromEntries(FUNDER_STAGES.map((s) => [s, 0])) as Record<
    FunderStage,
    number
  >;
  for (const c of stageCounts) counts[c.stage] = c.n;

  const items: FunderRelationSummaryDto[] = rows.map(({ relation, ownerName }) => {
    const t = totals.get(relation.id);
    const l = last.get(relation.id);
    return {
      ...toRelationDto(relation),
      ownerName: ownerName ?? null,
      applicationCount: t?.applicationCount ?? 0,
      awardedCents: t?.awardedCents ?? 0,
      contactCount: contacts.get(relation.id) ?? 0,
      lastInteractionAt: l ? new Date(l).toISOString() : null,
    };
  });
  return { items, counts, canEdit };
}

export async function createRelation(
  ctx: AppContext,
  orgId: string,
  input: CreateFunderRelationInput,
  actor: Actor,
): Promise<FunderRelationDto> {
  let funderId: string | null = null;
  if (input.funderId) {
    const f = await ctx.db
      .select({ id: funders.id })
      .from(funders)
      .where(eq(funders.id, input.funderId))
      .get();
    if (!f) throw notFound("Funder");
    funderId = f.id;
  }
  const ein = input.prospectEin ? normalizeEin(input.prospectEin) : null;
  if (input.ownerId) await assertMember(ctx, orgId, input.ownerId);

  const dupe = await ctx.db
    .select({ id: orgFunderRelations.id })
    .from(orgFunderRelations)
    .where(
      and(
        eq(orgFunderRelations.orgId, orgId),
        funderId
          ? eq(orgFunderRelations.funderId, funderId)
          : ein
            ? eq(orgFunderRelations.prospectEin, ein)
            : eq(orgFunderRelations.normalizedName, normalizeFunderName(input.displayName)),
      ),
    )
    .get();
  if (dupe) throw conflict("This funder is already in your relationships");

  const now = ctx.now();
  const id = newRelationId();
  const [row] = await ctx.db
    .insert(orgFunderRelations)
    .values({
      id,
      orgId,
      funderId,
      prospectEin: ein,
      displayName: input.displayName,
      normalizedName: normalizeFunderName(input.displayName) || "unknown",
      stage: input.stage ?? "prospect",
      stageSource: input.stage ? "manual" : "auto",
      origin: "manual",
      ownerId: input.ownerId ?? null,
      nextStepAt: toDate(input.nextStepAt) ?? null,
      nextStepNote: input.nextStepNote ?? "",
      tags: cleanTags(input.tags ?? []),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("relation insert failed");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "funder_relation.created",
    targetType: "org_funder_relation",
    targetId: id,
    metadata: { stage: row.stage, funderId, ein },
    requestId: actor.requestId,
  });
  return toRelationDto(row);
}

export async function updateRelation(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: UpdateFunderRelationInput,
  actor: Actor,
): Promise<FunderRelationDto> {
  const cur = await loadRelation(ctx, orgId, id);
  const set: Partial<typeof orgFunderRelations.$inferInsert> = {};
  if (patch.displayName !== undefined && patch.displayName !== cur.displayName) {
    set.displayName = patch.displayName;
    set.normalizedName = normalizeFunderName(patch.displayName) || "unknown";
  }
  if (patch.stage === "auto") {
    if (cur.stageSource !== "auto") set.stageSource = "auto";
  } else if (
    patch.stage !== undefined &&
    (patch.stage !== cur.stage || cur.stageSource !== "manual")
  ) {
    set.stage = patch.stage;
    set.stageSource = "manual";
  }
  if (patch.ownerId !== undefined && patch.ownerId !== cur.ownerId) {
    if (patch.ownerId) await assertMember(ctx, orgId, patch.ownerId);
    set.ownerId = patch.ownerId;
  }
  const nextAt = toDate(patch.nextStepAt);
  if (nextAt !== undefined && (nextAt?.getTime() ?? null) !== (cur.nextStepAt?.getTime() ?? null)) {
    set.nextStepAt = nextAt;
    set.nextStepNotifiedAt = null;
  }
  if (patch.nextStepNote !== undefined && patch.nextStepNote !== cur.nextStepNote) {
    set.nextStepNote = patch.nextStepNote;
  }
  if (patch.tags !== undefined) {
    const tags = cleanTags(patch.tags);
    if (JSON.stringify(tags) !== JSON.stringify(cur.tags)) set.tags = tags;
  }
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(orgFunderRelations)
      .set({ ...set, updatedAt: ctx.now() })
      .where(and(eq(orgFunderRelations.id, id), eq(orgFunderRelations.orgId, orgId)));
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: actor.userId,
      action: "funder_relation.updated",
      targetType: "org_funder_relation",
      targetId: id,
      // Field names only: the next-step note may hold relationship details.
      metadata: {
        fields: Object.keys(set),
        ...(set.stage ? { from: cur.stage, to: set.stage } : {}),
      },
      requestId: actor.requestId,
    });
    // Handing the stage back to the system: recompute it now.
    if (set.stageSource === "auto") await syncRelations(ctx, orgId);
  }
  return toRelationDto(await loadRelation(ctx, orgId, id));
}

// ------------------------------------------------------------------------------------ contacts

export async function listContacts(ctx: AppContext, orgId: string, relationId: string) {
  await loadRelation(ctx, orgId, relationId);
  const rows = await ctx.db
    .select()
    .from(orgFunderContacts)
    .where(and(eq(orgFunderContacts.orgId, orgId), eq(orgFunderContacts.relationId, relationId)))
    .orderBy(orgFunderContacts.name, orgFunderContacts.id)
    .limit(200)
    .all();
  return rows.map(toContactDto);
}

async function loadContact(ctx: AppContext, orgId: string, relationId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(orgFunderContacts)
    .where(
      and(
        eq(orgFunderContacts.id, id),
        eq(orgFunderContacts.orgId, orgId),
        eq(orgFunderContacts.relationId, relationId),
      ),
    )
    .get();
  if (!row) throw notFound("Contact");
  return row;
}

const contactFields = (input: FunderContactPatch) => {
  const set: Partial<typeof orgFunderContacts.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.role !== undefined) set.role = input.role;
  if (input.email !== undefined) set.email = input.email || null;
  if (input.phone !== undefined) set.phone = input.phone || null;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.preferredContact !== undefined) set.preferredContact = input.preferredContact;
  return set;
};

async function touch(ctx: AppContext, orgId: string, relationId: string) {
  await ctx.db
    .update(orgFunderRelations)
    .set({ updatedAt: ctx.now() })
    .where(and(eq(orgFunderRelations.id, relationId), eq(orgFunderRelations.orgId, orgId)));
}

export async function createContact(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  input: FunderContactInput,
  actor: Actor,
): Promise<FunderContactDto> {
  await loadRelation(ctx, orgId, relationId);
  const now = ctx.now();
  const id = newContactId();
  const [row] = await ctx.db
    .insert(orgFunderContacts)
    .values({
      role: "",
      notes: "",
      ...contactFields(input),
      id,
      orgId,
      relationId,
      name: input.name,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("contact insert failed");
  await touch(ctx, orgId, relationId);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "funder_contact.created",
    targetType: "org_funder_contact",
    targetId: id,
    metadata: { relationId },
    requestId: actor.requestId,
  });
  return toContactDto(row);
}

export async function updateContact(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  id: string,
  patch: FunderContactPatch,
  actor: Actor,
): Promise<FunderContactDto> {
  await loadContact(ctx, orgId, relationId, id);
  const set = contactFields(patch);
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(orgFunderContacts)
      .set({ ...set, updatedAt: ctx.now() })
      .where(and(eq(orgFunderContacts.id, id), eq(orgFunderContacts.orgId, orgId)));
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: actor.userId,
      action: "funder_contact.updated",
      targetType: "org_funder_contact",
      targetId: id,
      metadata: { relationId, fields: Object.keys(set) },
      requestId: actor.requestId,
    });
  }
  return toContactDto(await loadContact(ctx, orgId, relationId, id));
}

export async function deleteContact(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  await loadContact(ctx, orgId, relationId, id);
  await ctx.db
    .delete(orgFunderContacts)
    .where(and(eq(orgFunderContacts.id, id), eq(orgFunderContacts.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "funder_contact.deleted",
    targetType: "org_funder_contact",
    targetId: id,
    metadata: { relationId },
    requestId: actor.requestId,
  });
}

// ------------------------------------------------------------------------------------ interactions

export async function listInteractions(
  ctx: AppContext,
  orgId: string,
  relationId: string,
): Promise<FunderInteractionDto[]> {
  await loadRelation(ctx, orgId, relationId);
  const rows = await ctx.db
    .select({ i: orgFunderInteractions, by: user.name })
    .from(orgFunderInteractions)
    .leftJoin(user, eq(user.id, orgFunderInteractions.createdBy))
    .where(
      and(eq(orgFunderInteractions.orgId, orgId), eq(orgFunderInteractions.relationId, relationId)),
    )
    .orderBy(desc(orgFunderInteractions.occurredAt), desc(orgFunderInteractions.id))
    .limit(500)
    .all();
  return rows.map((r) => toInteractionDto(r.i, r.by ?? null));
}

async function loadInteraction(ctx: AppContext, orgId: string, relationId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(orgFunderInteractions)
    .where(
      and(
        eq(orgFunderInteractions.id, id),
        eq(orgFunderInteractions.orgId, orgId),
        eq(orgFunderInteractions.relationId, relationId),
      ),
    )
    .get();
  if (!row) throw notFound("Interaction");
  return row;
}

async function assertContactOf(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  contactId: string | null | undefined,
) {
  if (contactId) await loadContact(ctx, orgId, relationId, contactId);
}

export async function createInteraction(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  input: FunderInteractionInput,
  actor: Actor,
): Promise<FunderInteractionDto> {
  await loadRelation(ctx, orgId, relationId);
  await assertContactOf(ctx, orgId, relationId, input.contactId);
  const now = ctx.now();
  const id = newInteractionId();
  const [row] = await ctx.db
    .insert(orgFunderInteractions)
    .values({
      id,
      orgId,
      relationId,
      contactId: input.contactId ?? null,
      kind: input.kind,
      occurredAt: new Date(input.occurredAt),
      summary: input.summary,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("interaction insert failed");
  await touch(ctx, orgId, relationId);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "funder_interaction.logged",
    targetType: "org_funder_interaction",
    targetId: id,
    metadata: { relationId, kind: input.kind },
    requestId: actor.requestId,
  });
  const by = await ctx.db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, actor.userId))
    .get();
  return toInteractionDto(row, by?.name ?? null);
}

export async function updateInteraction(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  id: string,
  patch: FunderInteractionPatch,
  actor: Actor,
): Promise<FunderInteractionDto> {
  await loadInteraction(ctx, orgId, relationId, id);
  await assertContactOf(ctx, orgId, relationId, patch.contactId);
  const set: Partial<typeof orgFunderInteractions.$inferInsert> = {};
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.occurredAt !== undefined) set.occurredAt = new Date(patch.occurredAt);
  if (patch.summary !== undefined) set.summary = patch.summary;
  if (patch.contactId !== undefined) set.contactId = patch.contactId;
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(orgFunderInteractions)
      .set({ ...set, updatedAt: ctx.now() })
      .where(and(eq(orgFunderInteractions.id, id), eq(orgFunderInteractions.orgId, orgId)));
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: actor.userId,
      action: "funder_interaction.updated",
      targetType: "org_funder_interaction",
      targetId: id,
      metadata: { relationId, fields: Object.keys(set) },
      requestId: actor.requestId,
    });
  }
  const rows = await listInteractions(ctx, orgId, relationId);
  const out = rows.find((r) => r.id === id);
  if (!out) throw notFound("Interaction");
  return out;
}

export async function deleteInteraction(
  ctx: AppContext,
  orgId: string,
  relationId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  await loadInteraction(ctx, orgId, relationId, id);
  await ctx.db
    .delete(orgFunderInteractions)
    .where(and(eq(orgFunderInteractions.id, id), eq(orgFunderInteractions.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "funder_interaction.deleted",
    targetType: "org_funder_interaction",
    targetId: id,
    metadata: { relationId },
    requestId: actor.requestId,
  });
}
