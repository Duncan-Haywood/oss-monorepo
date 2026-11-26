// Routing templates (src/shared/routings.ts): list, save, edit and delete a shop's routings. Every
// query is scoped by orgId, and every machine and finishing id a routing stores must be on this
// shop's own rate card, so a routing can never carry another shop's ids. Applying a routing to a
// line happens in the editor (applyRouting) and is saved and priced like any other line edit.

import {
  type RoutingSuggestionsDto,
  SUGGEST_HISTORY_LINES,
  type SuggestHistoryLine,
  suggestRoutings,
} from "@shared/routing-suggest";
import {
  MAX_ROUTINGS,
  type RoutingCreate,
  type RoutingDto,
  type RoutingFinishing,
  type RoutingOperation,
  type RoutingPatch,
  routingNameKey,
  sortRoutings,
} from "@shared/routings";
import { and, count, desc, eq, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { finishingOps, machines, materials, quoteLines, quotes, routings } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

type Row = typeof routings.$inferSelect;
type Names = Map<string, { name: string; active: boolean }>;

async function cardNames(ctx: AppContext, orgId: string): Promise<{ m: Names; f: Names }> {
  const [ms, fs] = await Promise.all([
    ctx.db
      .select({ id: machines.id, name: machines.name, active: machines.active })
      .from(machines)
      .where(eq(machines.orgId, orgId))
      .all(),
    ctx.db
      .select({ id: finishingOps.id, name: finishingOps.name, active: finishingOps.active })
      .from(finishingOps)
      .where(eq(finishingOps.orgId, orgId))
      .all(),
  ]);
  return { m: new Map(ms.map((x) => [x.id, x])), f: new Map(fs.map((x) => [x.id, x])) };
}

function toDto(r: Row, names: { m: Names; f: Names }): RoutingDto {
  return {
    id: r.id,
    name: r.name,
    partFamily: r.partFamily,
    operations: r.operations.map((o) => {
      const m = names.m.get(o.machineId);
      return { ...o, machine: m?.name ?? "Unknown machine", retired: !m?.active };
    }),
    finishing: r.finishing.map((f) => {
      const op = names.f.get(f.opId);
      return { opId: f.opId, name: op?.name ?? "Unknown finishing", retired: !op?.active };
    }),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Every id must be on this shop's card (a retired row is allowed: it is flagged, not priced). */
function assertOwnIds(
  names: { m: Names; f: Names },
  operations: readonly RoutingOperation[] | undefined,
  finishing: readonly RoutingFinishing[] | undefined,
) {
  for (const o of operations ?? []) {
    if (!names.m.has(o.machineId))
      throw badRequest("A routing operation's machine is not on the rate card");
  }
  for (const f of finishing ?? []) {
    if (!names.f.has(f.opId))
      throw badRequest("A routing's finishing step is not on the rate card");
  }
}

const uniqueFinishing = (f: readonly RoutingFinishing[]) => [
  ...new Map(f.map((x) => [x.opId, { opId: x.opId }])).values(),
];

async function getRow(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(routings)
    .where(and(eq(routings.id, id), eq(routings.orgId, orgId)))
    .get();
  if (!row) throw notFound("Routing");
  return row;
}

async function assertNameFree(ctx: AppContext, orgId: string, name: string, exceptId?: string) {
  const clash = await ctx.db
    .select({ id: routings.id })
    .from(routings)
    .where(
      and(
        eq(routings.orgId, orgId),
        eq(routings.nameKey, routingNameKey(name)),
        ...(exceptId ? [ne(routings.id, exceptId)] : []),
      ),
    )
    .get();
  if (clash) throw conflict(`A routing named "${name}" already exists`);
}

export async function listRoutings(ctx: AppContext, orgId: string): Promise<RoutingDto[]> {
  const [rows, names] = await Promise.all([
    ctx.db.select().from(routings).where(eq(routings.orgId, orgId)).all(),
    cardNames(ctx, orgId),
  ]);
  return sortRoutings(rows.map((r) => toDto(r, names)));
}

export async function createRouting(
  ctx: AppContext,
  orgId: string,
  userId: string,
  v: RoutingCreate,
): Promise<RoutingDto> {
  const names = await cardNames(ctx, orgId);
  assertOwnIds(names, v.operations, v.finishing);
  const [{ n } = { n: 0 }] = await ctx.db
    .select({ n: count() })
    .from(routings)
    .where(eq(routings.orgId, orgId))
    .all();
  if (n >= MAX_ROUTINGS) throw conflict(`A shop can keep at most ${MAX_ROUTINGS} routings`);
  await assertNameFree(ctx, orgId, v.name);
  const [row] = await ctx.db
    .insert(routings)
    .values({
      id: newId("rtg"),
      orgId,
      name: v.name,
      nameKey: routingNameKey(v.name),
      partFamily: v.partFamily || null,
      operations: v.operations,
      finishing: uniqueFinishing(v.finishing),
      createdBy: userId,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return toDto(row, names);
}

export async function updateRouting(
  ctx: AppContext,
  orgId: string,
  id: string,
  p: RoutingPatch,
): Promise<RoutingDto> {
  const current = await getRow(ctx, orgId, id);
  // Two estimators editing one routing: the second save would silently undo the first. The editor
  // sends the updatedAt it loaded; a different stored one means someone saved in between.
  if (p.ifUpdatedAt !== undefined && current.updatedAt.toISOString() !== p.ifUpdatedAt) {
    throw conflict(
      `Someone else changed the routing "${current.name}" since you opened it. Reload to see their changes.`,
    );
  }
  const names = await cardNames(ctx, orgId);
  assertOwnIds(names, p.operations, p.finishing);
  if (p.name !== undefined) await assertNameFree(ctx, orgId, p.name, id);
  const [row] = await ctx.db
    .update(routings)
    .set({
      ...(p.name !== undefined ? { name: p.name, nameKey: routingNameKey(p.name) } : {}),
      ...(p.partFamily !== undefined ? { partFamily: p.partFamily || null } : {}),
      ...(p.operations !== undefined ? { operations: p.operations } : {}),
      ...(p.finishing !== undefined ? { finishing: uniqueFinishing(p.finishing) } : {}),
    })
    .where(and(eq(routings.id, id), eq(routings.orgId, orgId)))
    .returning();
  if (!row) throw notFound("Routing");
  return toDto(row, names);
}

export async function deleteRouting(ctx: AppContext, orgId: string, id: string) {
  const gone = await ctx.db
    .delete(routings)
    .where(and(eq(routings.id, id), eq(routings.orgId, orgId)))
    .returning({ id: routings.id });
  if (gone.length === 0) throw notFound("Routing");
}

/**
 * Routings, part 3 (shared/routing-suggest.ts): the shop's routings ranked for one line from the
 * shop's own most recent lines. Superseded revisions are left out (their lines are repeated in the
 * revision that replaced them) and so is the line being edited. The shop's material names (retired
 * rows too, since old lines may use them) give each line's alloy family (part 4). Every query
 * filters by orgId.
 */
export async function suggestRoutingsFor(
  ctx: AppContext,
  orgId: string,
  q: { materialId: string | null; description: string | null; lineId: string | null },
): Promise<RoutingSuggestionsDto> {
  const [rows, lines, mats] = await Promise.all([
    ctx.db
      .select({
        id: routings.id,
        name: routings.name,
        partFamily: routings.partFamily,
        operations: routings.operations,
      })
      .from(routings)
      .where(eq(routings.orgId, orgId))
      .all(),
    ctx.db
      .select({
        lineId: quoteLines.id,
        description: quoteLines.description,
        inputs: quoteLines.inputs,
        status: quotes.status,
      })
      .from(quoteLines)
      .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.orgId, orgId)))
      .where(
        and(
          eq(quoteLines.orgId, orgId),
          ne(quotes.status, "superseded"),
          ...(q.lineId ? [ne(quoteLines.id, q.lineId)] : []),
        ),
      )
      .orderBy(desc(quoteLines.createdAt))
      .limit(SUGGEST_HISTORY_LINES)
      .all(),
    ctx.db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .all(),
  ]);
  if (rows.length === 0) return { items: [], historyLines: lines.length };
  const history: SuggestHistoryLine[] = lines.map((l) => ({
    lineId: l.lineId,
    materialId: l.inputs.material?.materialId ?? null,
    description: l.description,
    operations: l.inputs.operations,
    won: l.status === "won",
  }));
  return {
    items: suggestRoutings({
      routings: rows,
      history,
      materialId: q.materialId,
      description: q.description,
      materialNames: new Map(mats.map((m) => [m.id, m.name])),
    }),
    historyLines: lines.length,
  };
}
