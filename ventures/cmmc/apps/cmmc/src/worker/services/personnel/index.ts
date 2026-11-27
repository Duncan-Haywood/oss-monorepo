// Personnel and training records (AT.L2-3.2.1 to 3.2.3, PS.L2-3.9.1 and 3.9.2). Rows are
// tenant-scoped; every write is audited. The checks and the CSV are pure, in @shared/personnel.
import {
  checkPersonnel,
  DEFAULT_REFRESH_MONTHS,
  type DepartureKind,
  MAX_PEOPLE_PER_ORG,
  type PersonLike,
  type TrainingDueDate,
  trainingAttention,
  trainingDueDates,
  validatePerson,
} from "@shared/personnel";
import { and, asc, count, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { orgProfile, person } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export type PersonRow = typeof person.$inferSelect;

export interface PersonInput {
  name: string;
  jobTitle?: string;
  email?: string;
  cuiAccess?: boolean;
  securityDuties?: boolean;
  dutiesDescription?: string;
  screenedOn?: string | null;
  screeningMethod?: string;
  accessGrantedOn?: string | null;
  awarenessOn?: string | null;
  roleBasedOn?: string | null;
  insiderThreatOn?: string | null;
  leftOn?: string | null;
  departureKind?: DepartureKind | null;
  accessRemovedOn?: string | null;
  notes?: string;
}

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export async function refreshMonths(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .select({ m: orgProfile.trainingRefreshMonths })
    .from(orgProfile)
    .where(eq(orgProfile.orgId, orgId))
    .get();
  return row?.m ?? DEFAULT_REFRESH_MONTHS;
}

export async function setRefreshMonths(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  months: number,
) {
  await ctx.db.insert(orgProfile).values({ orgId }).onConflictDoNothing();
  await ctx.db
    .update(orgProfile)
    .set({ trainingRefreshMonths: months })
    .where(eq(orgProfile.orgId, orgId));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "personnel.refresh_interval",
    targetType: "org",
    targetId: orgId,
  });
}

export async function listPeople(ctx: AppContext, orgId: string): Promise<PersonRow[]> {
  return ctx.db
    .select()
    .from(person)
    .where(eq(person.orgId, orgId))
    .orderBy(asc(person.name))
    .all();
}

export async function personnelRecords(ctx: AppContext, orgId: string) {
  const [items, months] = await Promise.all([listPeople(ctx, orgId), refreshMonths(ctx, orgId)]);
  const on = today(ctx);
  return {
    items,
    refreshMonths: months,
    today: on,
    check: checkPersonnel(items, on, months),
    attention: trainingAttention(items, on, months),
  };
}

/** Training refresher dates for the calendar file and the subscribable link: counts, no names. */
export async function trainingDueDatesFor(
  ctx: AppContext,
  orgId: string,
): Promise<TrainingDueDate[]> {
  const [items, months] = await Promise.all([listPeople(ctx, orgId), refreshMonths(ctx, orgId)]);
  return trainingDueDates(items, months);
}

export async function getPerson(ctx: AppContext, orgId: string, id: string): Promise<PersonRow> {
  const row = await ctx.db
    .select()
    .from(person)
    .where(and(eq(person.id, id), eq(person.orgId, orgId)))
    .get();
  if (!row) throw notFound("Person");
  return row;
}

const normalized = (p: PersonInput | PersonRow): Omit<PersonLike, "id"> & PersonInput => ({
  name: p.name,
  jobTitle: p.jobTitle ?? "",
  email: p.email ?? "",
  cuiAccess: p.cuiAccess ?? true,
  securityDuties: p.securityDuties ?? false,
  dutiesDescription: p.dutiesDescription ?? "",
  screenedOn: p.screenedOn ?? null,
  screeningMethod: p.screeningMethod ?? "",
  accessGrantedOn: p.accessGrantedOn ?? null,
  awarenessOn: p.awarenessOn ?? null,
  roleBasedOn: p.roleBasedOn ?? null,
  insiderThreatOn: p.insiderThreatOn ?? null,
  leftOn: p.leftOn ?? null,
  departureKind: p.departureKind ?? null,
  accessRemovedOn: p.accessRemovedOn ?? null,
  notes: p.notes ?? "",
});

function assertValid(ctx: AppContext, p: Omit<PersonLike, "id">) {
  const errors = validatePerson(p, today(ctx));
  if (errors.length > 0) throw badRequest(errors.join(" "));
}

export async function createPerson(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: PersonInput,
) {
  const values = normalized(input);
  assertValid(ctx, values);
  const existing = await ctx.db
    .select({ n: count() })
    .from(person)
    .where(eq(person.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_PEOPLE_PER_ORG)
    throw conflict(`A roster holds at most ${MAX_PEOPLE_PER_ORG} people.`);
  const id = newId("per");
  await ctx.db.insert(person).values({ ...values, id, orgId });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "person.create",
    targetType: "person",
    targetId: id,
  });
  return getPerson(ctx, orgId, id);
}

export async function updatePerson(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<PersonInput>,
) {
  const current = await getPerson(ctx, orgId, id);
  const merged = normalized({ ...current, ...patch } as PersonRow);
  // Clearing the departure date clears the departure with it (someone recorded as leaving by
  // mistake), unless the patch sets those fields itself.
  if (patch.leftOn === null) {
    if (patch.departureKind === undefined) merged.departureKind = null;
    if (patch.accessRemovedOn === undefined) merged.accessRemovedOn = null;
  }
  assertValid(ctx, merged);
  await ctx.db
    .update(person)
    .set(merged)
    .where(and(eq(person.id, id), eq(person.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "person.update",
    targetType: "person",
    targetId: id,
  });
  return getPerson(ctx, orgId, id);
}

export async function deletePerson(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await getPerson(ctx, orgId, id);
  await ctx.db.delete(person).where(and(eq(person.id, id), eq(person.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "person.delete",
    targetType: "person",
    targetId: id,
  });
}
