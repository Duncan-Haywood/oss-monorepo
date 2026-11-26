// Permanent deletion of an organization: R2 files, vectors, then every database row.
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  dataExports,
  documentChunks,
  documents,
  interviewTurns,
  opportunities,
  organization,
  submissions,
} from "../../db/schema";
import { audit } from "./audit";
import { deleteKeys, listKeys, orgPrefix } from "./r2";
import { tenantTables } from "./tenant-tables";

const VECTOR_BATCH = 100;

export interface DeletionReceipt {
  orgId: string;
  r2Objects: number;
  vectors: number;
  rows: Record<string, number>;
}

export async function deleteOrganizationData(
  ctx: AppContext,
  orgId: string,
  requestedBy: string | null,
): Promise<DeletionReceipt | null> {
  const org = await ctx.db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) {
    ctx.logger.info("privacy.org_delete.already_deleted", { orgId });
    return null;
  }

  // 1. Files. Everything under orgs/{orgId}/ plus any key a row references outside that prefix
  //    (should not exist, but never leave an orphan). Never touch another org's prefix.
  const prefix = orgPrefix(orgId);
  const keys = await listKeys(ctx.env.FILES, prefix);
  const referenced = [
    ...(await ctx.db
      .select({ a: documents.r2Key, b: documents.textR2Key })
      .from(documents)
      .where(eq(documents.orgId, orgId))
      .all()),
    ...(await ctx.db
      .select({ a: interviewTurns.audioR2Key })
      .from(interviewTurns)
      .where(eq(interviewTurns.orgId, orgId))
      .all()),
    ...(await ctx.db
      .select({ a: submissions.packageR2Key })
      .from(submissions)
      .where(eq(submissions.orgId, orgId))
      .all()),
    ...(await ctx.db
      .select({ a: dataExports.r2Key })
      .from(dataExports)
      .where(eq(dataExports.orgId, orgId))
      .all()),
    ...(await ctx.db
      .select({ a: opportunities.rawR2Key })
      .from(opportunities)
      .where(eq(opportunities.privateToOrgId, orgId))
      .all()),
  ].flatMap((r) => Object.values(r).filter((k): k is string => typeof k === "string" && !!k));
  for (const k of referenced) if (!k.startsWith("orgs/")) keys.push(k);
  const r2Objects = await deleteKeys(ctx.env.FILES, keys);

  // 2. Vectors (namespace = orgId). Done before rows so a failure can retry with the ids intact.
  const chunkIds = (
    await ctx.db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.orgId, orgId))
      .all()
  ).map((r) => r.id);
  for (let i = 0; i < chunkIds.length; i += VECTOR_BATCH) {
    await ctx.vectors.deleteByIds(orgId, chunkIds.slice(i, i + VECTOR_BATCH));
  }

  // 3. Rows. FK cascades from `organization` would remove these, but deleting table by table
  //    (dependents first, retrying on RESTRICT errors) gives per-table counts for the receipt and
  //    also catches any table whose org reference lacks ON DELETE CASCADE.
  const rows: Record<string, number> = {};
  let pending = tenantTables();
  for (let pass = 0; pass < 4 && pending.length; pass++) {
    const failed: typeof pending = [];
    for (const t of pending) {
      try {
        const res = await ctx.db.delete(t.table).where(eq(t.orgColumn, orgId)).run();
        rows[t.name] = (rows[t.name] ?? 0) + (res.meta.changes ?? 0);
      } catch {
        failed.push(t);
      }
    }
    pending = failed;
  }
  await ctx.db.delete(organization).where(eq(organization.id, orgId)).run();
  rows.organization = 1;

  // 4. Non-PII receipt: ids and counts only. orgId=null so it survives the org's own audit log.
  const receipt: DeletionReceipt = { orgId, r2Objects, vectors: chunkIds.length, rows };
  const totalRows = Object.values(rows).reduce((a, b) => a + b, 0);
  ctx.logger.info("privacy.org_deleted", {
    orgId,
    requestedBy,
    r2Objects,
    vectors: chunkIds.length,
    rows: totalRows,
  });
  await audit(ctx, {
    orgId: null,
    actorType: requestedBy ? "user" : "system",
    actorId: requestedBy,
    action: "organization.deleted",
    targetType: "organization",
    targetId: orgId,
    metadata: { r2Objects, vectors: chunkIds.length, rows, deletedAt: ctx.now().toISOString() },
  });
  return receipt;
}
