// Daily retention sweep: purge raw originals past the org's retention window (keeping extracted
// text), drop stored voice audio past the same window, and expire old data exports.
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { AppContext } from "../../context";
import { dataExports, documents, interviewTurns, orgSettings, purgedFiles } from "../../db/schema";
import { audit } from "./audit";

const DAY_MS = 86_400_000;

export interface RetentionResult {
  originalsPurged: number;
  audioPurged: number;
  exportsExpired: number;
}

export async function runRetentionSweep(ctx: AppContext): Promise<RetentionResult> {
  const now = ctx.now();
  const result: RetentionResult = { originalsPurged: 0, audioPurged: 0, exportsExpired: 0 };

  const policies = await ctx.db
    .select({ orgId: orgSettings.orgId, days: orgSettings.rawFileRetentionDays })
    .from(orgSettings)
    .where(isNotNull(orgSettings.rawFileRetentionDays))
    .all();

  for (const { orgId, days } of policies) {
    if (days == null || days < 0) continue;
    const cutoff = new Date(now.getTime() - days * DAY_MS);

    const docs = await ctx.db
      .select({ id: documents.id, r2Key: documents.r2Key, textR2Key: documents.textR2Key })
      .from(documents)
      .leftJoin(purgedFiles, eq(purgedFiles.r2Key, documents.r2Key))
      .where(
        and(
          eq(documents.orgId, orgId),
          eq(documents.status, "ready"),
          isNotNull(documents.textR2Key),
          lt(documents.processedAt, cutoff),
          isNull(purgedFiles.r2Key),
        ),
      )
      .all();
    let originals = 0;
    for (const d of docs) {
      if (!d.r2Key.startsWith(`orgs/${orgId}/`) || d.r2Key === d.textR2Key) continue;
      await ctx.env.FILES.delete(d.r2Key);
      await ctx.db
        .insert(purgedFiles)
        .values({ r2Key: d.r2Key, orgId, targetType: "document", targetId: d.id, purgedAt: now })
        .onConflictDoNothing();
      originals++;
    }

    const turns = await ctx.db
      .select({ id: interviewTurns.id, key: interviewTurns.audioR2Key })
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.orgId, orgId),
          isNotNull(interviewTurns.audioR2Key),
          lt(interviewTurns.createdAt, cutoff),
        ),
      )
      .all();
    let audio = 0;
    for (const t of turns) {
      if (!t.key?.startsWith(`orgs/${orgId}/`)) continue;
      await ctx.env.FILES.delete(t.key);
      await ctx.db
        .update(interviewTurns)
        .set({ audioR2Key: null })
        .where(and(eq(interviewTurns.id, t.id), eq(interviewTurns.orgId, orgId)));
      audio++;
    }

    if (originals || audio) {
      await audit(ctx, {
        orgId,
        actorType: "system",
        action: "privacy.retention_purged",
        metadata: { originals, audio, retentionDays: days },
      });
    }
    result.originalsPurged += originals;
    result.audioPurged += audio;
  }

  const expired = await ctx.db
    .select({ id: dataExports.id, orgId: dataExports.orgId, r2Key: dataExports.r2Key })
    .from(dataExports)
    .where(and(eq(dataExports.status, "ready"), lt(dataExports.expiresAt, now)))
    .all();
  for (const e of expired) {
    if (e.r2Key) await ctx.env.FILES.delete(e.r2Key);
    await ctx.db
      .update(dataExports)
      .set({ status: "expired", r2Key: null })
      .where(and(eq(dataExports.id, e.id), eq(dataExports.orgId, e.orgId)));
    result.exportsExpired++;
  }

  ctx.logger.info("privacy.retention_sweep", { ...result });
  return result;
}
