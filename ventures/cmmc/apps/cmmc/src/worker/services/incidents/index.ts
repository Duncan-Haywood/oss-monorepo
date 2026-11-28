// Cyber incident register (IR.L2-3.6.1, 3.6.2; DFARS 252.204-7012 (c) to (m)). Rows are tenant-scoped;
// every write is audited. Clocks, stage, checklist and checks are pure, in @shared/incidents.
//
// On every plan, deliberately: the 72-hour report clock is an emergency tool, and a shop on the free
// Level 1 plan that holds covered defense information under a flowed-down 7012 clause needs it as much
// as a Level 2 customer does.
import {
  type Affects,
  applicability,
  type ClauseAnswer,
  type IncidentFacts,
  type IncidentRole,
  incidentAttention,
  incidentChecklist,
  incidentClocks,
  incidentHoldDates,
  incidentIssues,
  incidentStage,
  MAX_INCIDENTS_PER_ORG,
  type TimelineEntry,
  type Tri,
  validateIncident,
} from "@shared/incidents";
import { and, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { incident } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export type IncidentRow = typeof incident.$inferSelect;

export interface IncidentInput {
  title: string;
  clause?: ClauseAnswer;
  affects?: Affects;
  role?: IncidentRole;
  higherTier?: string;
  contractRef?: string;
  discoveredAt: string;
  reportedAt?: string | null;
  reportNumber?: string;
  higherTierNotifiedAt?: string | null;
  malware?: Tri;
  cloud?: Tri;
  systems?: string;
  summary?: string;
  steps?: Record<string, boolean>;
  timeline?: TimelineEntry[];
  closedOn?: string | null;
  lessons?: string;
}

const DEFAULTS: Omit<IncidentFacts, "title" | "discoveredAt"> = {
  clause: "unsure",
  affects: "unsure",
  role: "prime",
  higherTier: "",
  contractRef: "",
  reportedAt: null,
  reportNumber: "",
  higherTierNotifiedAt: null,
  malware: "unknown",
  cloud: "unknown",
  systems: "",
  summary: "",
  steps: {},
  timeline: [],
  closedOn: null,
  lessons: "",
};

export async function listIncidents(ctx: AppContext, orgId: string): Promise<IncidentRow[]> {
  return ctx.db
    .select()
    .from(incident)
    .where(eq(incident.orgId, orgId))
    .orderBy(desc(incident.discoveredAt))
    .all();
}

export function describeIncident(r: IncidentRow, now: Date) {
  return {
    ...r,
    stage: incidentStage(r, now),
    clocks: incidentClocks(r, now),
    applicability: applicability(r),
    checklist: incidentChecklist(r),
    issues: incidentIssues(r, now),
  };
}

export async function incidentList(ctx: AppContext, orgId: string) {
  const rows = await listIncidents(ctx, orgId);
  const now = ctx.now();
  return {
    now: now.toISOString(),
    items: rows.map((r) => describeIncident(r, now)),
    attention: incidentAttention(rows, now),
  };
}

/** Image-hold end days for the calendar file and link: counts per day, no titles. */
export async function incidentHoldDatesFor(ctx: AppContext, orgId: string) {
  return incidentHoldDates(await listIncidents(ctx, orgId), ctx.now());
}

export async function getIncident(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(incident)
    .where(and(eq(incident.id, id), eq(incident.orgId, orgId)))
    .get();
  if (!row) throw notFound("Incident");
  return row;
}

function check(ctx: AppContext, merged: IncidentFacts) {
  const errors = validateIncident(merged, ctx.now());
  if (errors.length) throw badRequest(errors.join(" "));
}

export async function createIncident(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: IncidentInput,
) {
  const values: IncidentFacts = { ...DEFAULTS, ...input } as IncidentFacts;
  check(ctx, values);
  const existing = await ctx.db
    .select({ n: count() })
    .from(incident)
    .where(eq(incident.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_INCIDENTS_PER_ORG)
    throw conflict(`The register holds at most ${MAX_INCIDENTS_PER_ORG} incidents.`);
  const id = newId("inc");
  await ctx.db.insert(incident).values({ id, orgId, ...values });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "incident.create",
    targetType: "incident",
    targetId: id,
  });
  return getIncident(ctx, orgId, id);
}

export async function updateIncident(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<IncidentInput>,
) {
  const row = await getIncident(ctx, orgId, id);
  // Checked as the row will be after the change, so a patch cannot leave it inconsistent.
  check(ctx, { ...row, ...patch } as IncidentFacts);
  await ctx.db
    .update(incident)
    .set(patch)
    .where(and(eq(incident.id, id), eq(incident.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "incident.update",
    targetType: "incident",
    targetId: id,
  });
  return getIncident(ctx, orgId, id);
}

export async function deleteIncident(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await getIncident(ctx, orgId, id);
  await ctx.db.delete(incident).where(and(eq(incident.id, id), eq(incident.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "incident.delete",
    targetType: "incident",
    targetId: id,
  });
}
