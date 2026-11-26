// Projects the org wants funded. A project's own fields are mirrored into user_entered, confirmed
// facts (projectField set) so drafting — which may only assert facts — can cite them. When a field
// changes, the old mirrored fact is superseded (drafts that cited it keep a valid reference).
import type { ProjectStatus } from "@shared/enums";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { facts, organization, projects } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../privacy/audit";
import type { Actor, FactRow } from "./facts";

export type ProjectRow = typeof projects.$inferSelect;

export interface ProjectInput {
  title?: string;
  summary?: string;
  problem?: string;
  approach?: string;
  populationServed?: string;
  location?: string;
  budgetNeededCents?: number | null;
  timelineStart?: string | null;
  timelineEnd?: string | null;
  status?: ProjectStatus;
  priority?: number;
}

export async function listProjects(
  ctx: AppContext,
  orgId: string,
  opts: { status?: ProjectStatus } = {},
): Promise<(ProjectRow & { factCount: number })[]> {
  const rows = await ctx.db
    .select()
    .from(projects)
    .where(
      and(eq(projects.orgId, orgId), opts.status ? eq(projects.status, opts.status) : undefined),
    )
    .orderBy(asc(projects.priority), desc(projects.updatedAt))
    .all();
  const counts = await ctx.db
    .select({ projectId: facts.projectId, n: sql<number>`count(*)` })
    .from(facts)
    .where(and(eq(facts.orgId, orgId), isNotNull(facts.projectId), ne(facts.status, "superseded")))
    .groupBy(facts.projectId)
    .all();
  const byId = new Map(counts.map((c) => [c.projectId, Number(c.n)]));
  return rows.map((p) => ({ ...p, factCount: byId.get(p.id) ?? 0 }));
}

export async function getProject(ctx: AppContext, orgId: string, id: string): Promise<ProjectRow> {
  const row = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
    .get();
  if (!row) throw notFound("Project");
  return row;
}

export async function getProjectDetail(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<ProjectRow & { facts: FactRow[] }> {
  const p = await getProject(ctx, orgId, id);
  const rows = await ctx.db
    .select()
    .from(facts)
    .where(and(eq(facts.orgId, orgId), eq(facts.projectId, id), ne(facts.status, "superseded")))
    .orderBy(asc(facts.category), asc(facts.createdAt))
    .all();
  return { ...p, facts: rows };
}

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;

/** The statements a project's fields assert, keyed by field. Empty fields assert nothing. */
export function projectFieldStatements(orgName: string, p: ProjectRow): Record<string, string> {
  const name = `${orgName}'s project "${p.title}"`;
  const out: Record<string, string> = {};
  const t = (s: string) => s.replace(/\s+/g, " ").trim();
  if (t(p.summary)) out.summary = `${name}: ${t(p.summary)}`;
  if (t(p.problem)) out.problem = `${name} addresses this need: ${t(p.problem)}`;
  if (t(p.approach)) out.approach = `${name} approach: ${t(p.approach)}`;
  if (t(p.populationServed)) out.populationServed = `${name} will serve: ${t(p.populationServed)}`;
  if (t(p.location)) out.location = `${name} location: ${t(p.location)}`;
  if (p.budgetNeededCents != null && p.budgetNeededCents > 0)
    out.budgetNeededCents = `${name} needs ${usd(p.budgetNeededCents)} in funding.`;
  if (p.timelineStart || p.timelineEnd)
    out.timeline = `${name} timeline: ${[
      p.timelineStart ? `starts ${p.timelineStart}` : null,
      p.timelineEnd ? `ends ${p.timelineEnd}` : null,
    ]
      .filter(Boolean)
      .join(", ")}.`;
  return out;
}

/** Keep mirrored project-field facts in sync with the project row. */
async function syncProjectFacts(ctx: AppContext, orgId: string, p: ProjectRow, userId: string) {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  const wanted = projectFieldStatements(org?.name ?? "The organization", p);
  const existing = await ctx.db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.orgId, orgId),
        eq(facts.projectId, p.id),
        isNotNull(facts.projectField),
        ne(facts.status, "superseded"),
      ),
    )
    .all();
  const now = ctx.now();
  const current = new Map(existing.map((f) => [f.projectField ?? "", f]));
  for (const [field, statement] of Object.entries(wanted)) {
    const old = current.get(field);
    if (old && old.statement === statement) continue;
    const id = newId("fct");
    await ctx.db.insert(facts).values({
      id,
      orgId,
      category: "project",
      statement,
      value:
        field === "budgetNeededCents" && p.budgetNeededCents != null
          ? { number: p.budgetNeededCents / 100, unit: "USD", year: null, text: null }
          : null,
      status: "confirmed",
      sensitivity: "internal",
      confidence: 1,
      sourceType: "user_entered",
      sourceQuote: "",
      projectId: p.id,
      projectField: field,
      createdBy: userId,
      confirmedBy: userId,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    if (old) {
      await ctx.db
        .update(facts)
        .set({ status: "superseded", supersededById: id, updatedAt: now })
        .where(and(eq(facts.id, old.id), eq(facts.orgId, orgId)));
    }
  }
  for (const [field, old] of current) {
    if (wanted[field]) continue;
    await ctx.db
      .update(facts)
      .set({ status: "superseded", updatedAt: now })
      .where(and(eq(facts.id, old.id), eq(facts.orgId, orgId)));
  }
}

function clean(input: ProjectInput): Partial<typeof projects.$inferInsert> {
  const out: Partial<typeof projects.$inferInsert> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

export async function createProject(
  ctx: AppContext,
  orgId: string,
  input: ProjectInput & { title: string },
  actor: Actor,
): Promise<ProjectRow> {
  const now = ctx.now();
  const id = newId("prj");
  const row = await ctx.db
    .insert(projects)
    .values({
      ...clean(input),
      id,
      orgId,
      title: input.title.trim(),
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await syncProjectFacts(ctx, orgId, row, actor.userId);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "project.created",
    targetType: "project",
    targetId: id,
    requestId: actor.requestId,
  });
  return row;
}

export async function updateProject(
  ctx: AppContext,
  orgId: string,
  id: string,
  input: ProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  await getProject(ctx, orgId, id);
  const row = await ctx.db
    .update(projects)
    .set({ ...clean(input), updatedAt: ctx.now() })
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
    .returning()
    .get();
  await syncProjectFacts(ctx, orgId, row, actor.userId);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "project.updated",
    targetType: "project",
    targetId: id,
    metadata: { fields: Object.keys(input) },
    requestId: actor.requestId,
  });
  return row;
}

/** Deletes the project. Its mirrored field facts are superseded; other linked facts become org-wide. */
export async function deleteProject(
  ctx: AppContext,
  orgId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  await getProject(ctx, orgId, id);
  const now = ctx.now();
  await ctx.db
    .update(facts)
    .set({ status: "superseded", updatedAt: now })
    .where(and(eq(facts.orgId, orgId), eq(facts.projectId, id), isNotNull(facts.projectField)));
  await ctx.db
    .update(facts)
    .set({ projectId: null, updatedAt: now })
    .where(and(eq(facts.orgId, orgId), eq(facts.projectId, id)));
  await ctx.db.delete(projects).where(and(eq(projects.id, id), eq(projects.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "project.deleted",
    targetType: "project",
    targetId: id,
    requestId: actor.requestId,
  });
}
