// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { dataExports } from "../../db/schema";
import type { JobOf } from "../../queues/messages";
import { notify } from "../notifications";
import { audit } from "./audit";
import { deleteOrganizationData } from "./deletion";
import { buildOrgExport } from "./export";
import { exportKey } from "./r2";
import { runRetentionSweep } from "./retention";

export const EXPORT_TTL_MS = 7 * 86_400_000;

export async function exportOrg(ctx: AppContext, job: JobOf<"privacy.export_org">): Promise<void> {
  const { orgId, exportId } = job;
  const where = and(eq(dataExports.id, exportId), eq(dataExports.orgId, orgId));
  const row = await ctx.db.select().from(dataExports).where(where).get();
  if (row?.status !== "pending") return;
  try {
    const { bytes, manifest } = await buildOrgExport(ctx, orgId);
    const key = exportKey(orgId, exportId);
    await ctx.env.FILES.put(key, bytes, { httpMetadata: { contentType: "application/zip" } });
    await ctx.db
      .update(dataExports)
      .set({
        status: "ready",
        r2Key: key,
        error: null,
        expiresAt: new Date(ctx.now().getTime() + EXPORT_TTL_MS),
      })
      .where(where);
    await audit(ctx, {
      orgId,
      actorType: "system",
      action: "privacy.export_ready",
      targetType: "data_export",
      targetId: exportId,
      metadata: { bytes: bytes.byteLength, files: manifest.files.length },
    });
    if (row.requestedBy) {
      await notify(ctx, {
        orgId,
        recipients: [row.requestedBy],
        kind: "export.ready",
        title: "Your data export is ready",
        body: `Download it from Privacy settings within ${EXPORT_TTL_MS / 86_400_000} days.`,
        link: `/orgs/${orgId}/settings/privacy`,
        severity: "success",
        dedupeKey: `export:${exportId}`,
      });
    }
  } catch (err) {
    ctx.logger.error("privacy.export_failed", { orgId, exportId, error: String(err) });
    await ctx.db
      .update(dataExports)
      .set({ status: "failed", error: "Export failed. Please try again." })
      .where(where);
  }
}

export async function deleteOrg(ctx: AppContext, job: JobOf<"privacy.delete_org">): Promise<void> {
  await deleteOrganizationData(ctx, job.orgId, job.requestedBy);
}

export async function retentionSweep(
  ctx: AppContext,
  _job: JobOf<"privacy.retention_sweep">,
): Promise<void> {
  await runRetentionSweep(ctx);
}
