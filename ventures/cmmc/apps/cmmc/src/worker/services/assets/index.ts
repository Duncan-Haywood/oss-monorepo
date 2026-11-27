// Level 2 asset inventory (32 CFR 170.19(c)). Rows are tenant-scoped; every write is audited.
// Category rules and the inventory checks are pure, in @shared/assets.
import {
  type AssetCategory,
  categoryProblem,
  checkInventory,
  MAX_ASSETS_PER_ORG,
  type SpecializedType,
} from "@shared/assets";
import { and, asc, count, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { asset, evidence, orgProfile } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export type AssetRow = typeof asset.$inferSelect;

export interface AssetInput {
  name: string;
  category: AssetCategory;
  specializedType?: SpecializedType | null;
  assetType?: string;
  location?: string;
  provider?: string;
  owner?: string;
  notes?: string;
}

export async function listAssets(ctx: AppContext, orgId: string): Promise<AssetRow[]> {
  return ctx.db
    .select()
    .from(asset)
    .where(eq(asset.orgId, orgId))
    .orderBy(asc(asset.category), asc(asset.name))
    .all();
}

export interface DiagramFile {
  id: string;
  title: string;
  fileName: string;
  sha256: string;
  createdAt: Date;
}

/** The evidence file linked as the network diagram of the assessment scope, or null. */
export async function networkDiagram(ctx: AppContext, orgId: string): Promise<DiagramFile | null> {
  const row = await ctx.db
    .select({
      id: evidence.id,
      title: evidence.title,
      fileName: evidence.fileName,
      sha256: evidence.sha256,
      createdAt: evidence.createdAt,
    })
    .from(orgProfile)
    // Join on org as well as id, so a stray id from another org can never resolve.
    .innerJoin(
      evidence,
      and(eq(evidence.id, orgProfile.networkDiagramEvidenceId), eq(evidence.orgId, orgId)),
    )
    .where(eq(orgProfile.orgId, orgId))
    .get();
  return row ?? null;
}

export async function assetInventory(ctx: AppContext, orgId: string) {
  const [items, diagram] = await Promise.all([listAssets(ctx, orgId), networkDiagram(ctx, orgId)]);
  return {
    items,
    networkDiagram: diagram,
    check: checkInventory(items, { hasNetworkDiagram: diagram !== null }),
  };
}

/** Link one of this org's evidence files as the network diagram, or unlink it (null). */
export async function setNetworkDiagram(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  evidenceId: string | null,
) {
  if (evidenceId) {
    const row = await ctx.db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.id, evidenceId), eq(evidence.orgId, orgId)))
      .get();
    if (!row) throw badRequest("Link an evidence file this organization holds.");
  }
  // The profile row exists for every org created here; insert it for older ones.
  await ctx.db.insert(orgProfile).values({ orgId }).onConflictDoNothing();
  await ctx.db
    .update(orgProfile)
    .set({ networkDiagramEvidenceId: evidenceId })
    .where(eq(orgProfile.orgId, orgId));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: evidenceId ? "asset_inventory.diagram_link" : "asset_inventory.diagram_unlink",
    targetType: "evidence",
    targetId: evidenceId,
  });
  return networkDiagram(ctx, orgId);
}

/** Called before an evidence file is deleted: the inventory goes back to no diagram. */
export async function unlinkNetworkDiagram(ctx: AppContext, orgId: string, evidenceId: string) {
  await ctx.db
    .update(orgProfile)
    .set({ networkDiagramEvidenceId: null })
    .where(and(eq(orgProfile.orgId, orgId), eq(orgProfile.networkDiagramEvidenceId, evidenceId)));
}

export async function getAsset(ctx: AppContext, orgId: string, id: string): Promise<AssetRow> {
  const row = await ctx.db
    .select()
    .from(asset)
    .where(and(eq(asset.id, id), eq(asset.orgId, orgId)))
    .get();
  if (!row) throw notFound("Asset");
  return row;
}

export async function createAsset(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: AssetInput,
) {
  const problem = categoryProblem(input.category, input.specializedType);
  if (problem) throw badRequest(problem);
  const existing = await ctx.db
    .select({ n: count() })
    .from(asset)
    .where(eq(asset.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_ASSETS_PER_ORG)
    throw conflict(`An inventory holds at most ${MAX_ASSETS_PER_ORG} assets.`);
  const id = newId("ast");
  await ctx.db.insert(asset).values({
    id,
    orgId,
    name: input.name,
    category: input.category,
    specializedType: input.specializedType ?? null,
    assetType: input.assetType ?? "",
    location: input.location ?? "",
    provider: input.provider ?? "",
    owner: input.owner ?? "",
    notes: input.notes ?? "",
  });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "asset.create",
    targetType: "asset",
    targetId: id,
  });
  return getAsset(ctx, orgId, id);
}

export async function updateAsset(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<AssetInput>,
) {
  const current = await getAsset(ctx, orgId, id);
  const category = patch.category ?? current.category;
  // Moving an asset out of "specialized" drops its type unless the patch names one.
  const specializedType =
    patch.specializedType !== undefined
      ? patch.specializedType
      : category === "specialized"
        ? current.specializedType
        : null;
  const problem = categoryProblem(category, specializedType);
  if (problem) throw badRequest(problem);
  await ctx.db
    .update(asset)
    .set({ ...patch, category, specializedType })
    .where(and(eq(asset.id, id), eq(asset.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "asset.update",
    targetType: "asset",
    targetId: id,
  });
  return getAsset(ctx, orgId, id);
}

export async function deleteAsset(ctx: AppContext, orgId: string, actorUserId: string, id: string) {
  await getAsset(ctx, orgId, id);
  await ctx.db.delete(asset).where(and(eq(asset.id, id), eq(asset.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "asset.delete",
    targetType: "asset",
    targetId: id,
  });
}
