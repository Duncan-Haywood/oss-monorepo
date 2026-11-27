// Asset list import: match a parsed sheet or scoping-worksheet file (src/shared/assets-import.ts) against the org's inventory and
// apply it in one D1 batch with one audit entry. A row is the asset already here with the same name
// (assetKey); then only the fields it fills and that differ change, so importing the same sheet twice
// changes nothing. Every other row becomes a new asset, up to MAX_ASSETS_PER_ORG.
import { type AssetCategory, MAX_ASSETS_PER_ORG, type SpecializedType } from "@shared/assets";
import {
  type AssetImportIssue,
  type AssetImportPlan,
  type AssetImportRow,
  assetKey,
  planAssetImport,
} from "@shared/assets-import";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { asset } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

type Field =
  | "category"
  | "specializedType"
  | "assetType"
  | "location"
  | "provider"
  | "owner"
  | "notes";

export interface AssetImportChange {
  line: number;
  name: string;
  category: AssetCategory;
  specializedType: SpecializedType | null;
  kind: "new" | "update";
  /** For an update, the fields that change. */
  fields: Field[];
}

export interface AssetImportPreview {
  format: AssetImportPlan["format"];
  columns: AssetImportPlan["columns"];
  changes: AssetImportChange[];
  unchanged: number;
  issues: AssetImportIssue[];
  /** Assets already in the inventory, and the most it holds. */
  existing: number;
  max: number;
  applied: boolean;
}

type Existing = typeof asset.$inferSelect;

function diff(row: AssetImportRow, cur: Existing): Field[] {
  const out: Field[] = [];
  if (row.category !== cur.category) out.push("category");
  if (row.specializedType !== cur.specializedType) out.push("specializedType");
  for (const f of ["assetType", "location", "provider", "owner", "notes"] as const)
    if (row[f] !== undefined && row[f] !== cur[f]) out.push(f);
  return out;
}

async function match(ctx: AppContext, orgId: string, csv: string) {
  const plan = planAssetImport(csv);
  const items = await ctx.db.select().from(asset).where(eq(asset.orgId, orgId)).all();
  const byKey = new Map<string, Existing>();
  for (const it of items) {
    const k = assetKey(it.name);
    if (!byKey.has(k)) byKey.set(k, it);
  }
  const changes: (AssetImportChange & { row: AssetImportRow; existing?: Existing })[] = [];
  let unchanged = 0;
  for (const row of plan.rows) {
    const existing = byKey.get(assetKey(row.name));
    const fields = existing ? diff(row, existing) : [];
    if (existing && !fields.length) {
      unchanged++;
      continue;
    }
    changes.push({
      line: row.line,
      name: row.name,
      category: row.category,
      specializedType: row.specializedType,
      kind: existing ? "update" : "new",
      fields,
      row,
      existing,
    });
  }
  const created = changes.filter((c) => c.kind === "new").length;
  const issues = [...plan.issues];
  if (items.length + created > MAX_ASSETS_PER_ORG)
    issues.unshift({
      line: null,
      message: `An inventory holds at most ${MAX_ASSETS_PER_ORG} assets: ${items.length} are here and the file adds ${created}. Import fewer rows.`,
    });
  const preview: AssetImportPreview = {
    format: plan.format,
    columns: plan.columns,
    changes: changes.map(({ row: _r, existing: _e, ...c }) => c),
    unchanged,
    issues,
    existing: items.length,
    max: MAX_ASSETS_PER_ORG,
    applied: false,
  };
  return { preview, changes, created };
}

export async function previewAssetImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
): Promise<AssetImportPreview> {
  return (await match(ctx, orgId, csv)).preview;
}

export async function applyAssetImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
): Promise<AssetImportPreview> {
  const { preview, changes, created } = await match(ctx, orgId, csv);
  if (!changes.length) return preview;
  if (preview.existing + created > MAX_ASSETS_PER_ORG)
    throw conflict(`An inventory holds at most ${MAX_ASSETS_PER_ORG} assets.`);
  const statements = [];
  const fresh = changes.filter((c) => c.kind === "new");
  // Up to thirteen bound values a row with the timestamps; D1 allows 100 per statement.
  for (let i = 0; i < fresh.length; i += 7) {
    statements.push(
      ctx.db.insert(asset).values(
        fresh.slice(i, i + 7).map(({ row }) => ({
          id: newId("ast"),
          orgId,
          name: row.name,
          category: row.category,
          specializedType: row.specializedType,
          assetType: row.assetType ?? "",
          location: row.location ?? "",
          provider: row.provider ?? "",
          owner: row.owner ?? "",
          notes: row.notes ?? "",
        })),
      ),
    );
  }
  for (const c of changes) {
    if (c.kind !== "update" || !c.existing) continue;
    const set: Partial<typeof asset.$inferInsert> = {};
    for (const f of c.fields) {
      if (f === "category") set.category = c.row.category;
      else if (f === "specializedType") set.specializedType = c.row.specializedType;
      else set[f] = c.row[f] ?? "";
    }
    statements.push(
      ctx.db
        .update(asset)
        .set(set)
        .where(and(eq(asset.orgId, orgId), eq(asset.id, c.existing.id))),
    );
  }
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "asset.import",
    targetType: "asset",
    targetId: `new:${fresh.length},updated:${changes.length - fresh.length}`,
  });
  return { ...preview, applied: true };
}
