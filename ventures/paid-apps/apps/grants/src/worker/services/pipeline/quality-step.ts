// Non-blocking quality pass (funder rubric scoring) after verification. It never throws and never
// changes the application's status: a failed review is logged, and routing / submission go on.
// Idempotent per version (a stored report is not recomputed), so it is safe in a Workflow step.
import type { AppContext } from "../../context";
import {
  loadQualityReport,
  opportunityCriteriaOf,
  reviewApplicationQuality,
  saveQualityReport,
} from "../quality";
import { pipelineDeps } from "./deps";
import {
  type AppIds,
  citedFactIds,
  loadApplication,
  loadSettings,
  loadVersion,
  loadVisibleOpportunity,
  requirementsOf,
} from "./steps";

/** Cross-module calls of the quality pass (stubbed in tests). */
export const qualityDeps = {
  review: reviewApplicationQuality,
  save: saveQualityReport,
};

export interface QualityStepResult {
  stored: boolean;
  skipped?: boolean;
  overallScore?: number | null;
}

export async function stepQuality(
  ctx: AppContext,
  ids: AppIds,
  versionId: string,
): Promise<QualityStepResult> {
  try {
    if (await loadQualityReport(ctx, ids, versionId)) return { stored: false, skipped: true };
    const app = await loadApplication(ctx, ids);
    const version = await loadVersion(ctx, ids, versionId);
    const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
    if (!version || !opp) return { stored: false, skipped: true };
    const settings = await loadSettings(ctx, ids.orgId);
    const [pool, cited] = await Promise.all([
      pipelineDeps.factsForDrafting(ctx, ids.orgId, {
        projectId: app.projectId,
        includeProposed: settings.allowUnconfirmedFactsInDrafts,
      }),
      pipelineDeps.factsByIds(ctx, ids.orgId, citedFactIds(version.content)),
    ]);
    // A person may have cited a fact outside the drafting pool: it still exists (usableFacts in the
    // reviewer drops rejected / superseded / restricted ones).
    const byId = new Map([...pool, ...cited].map((f) => [f.id, f]));
    const { report, model } = await qualityDeps.review(ctx, {
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      versionId,
      content: version.content,
      requirements: requirementsOf(opp),
      opportunity: opp,
      facts: [...byId.values()],
      criteria: opportunityCriteriaOf(opp.requirements),
    });
    await qualityDeps.save(ctx, { ...ids, versionId, report, model });
    ctx.logger.info("pipeline.quality_reviewed", {
      applicationId: ids.applicationId,
      versionId,
      overallScore: report.overallScore,
      droppedFactIds: report.droppedFactIds,
      droppedSuggestions: report.droppedSuggestions,
    });
    return { stored: true, overallScore: report.overallScore };
  } catch (e) {
    ctx.logger.warn("pipeline.quality_failed", {
      applicationId: ids.applicationId,
      versionId,
      error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : String(e),
    });
    return { stored: false };
  }
}

/** Inline (tests, demo): await the pass. Otherwise run it after the response (waitUntil). */
export async function runQualityPass(
  ctx: AppContext,
  ids: AppIds,
  versionId: string,
  inline: boolean,
): Promise<void> {
  if (inline) await stepQuality(ctx, ids, versionId);
  else ctx.defer(stepQuality(ctx, ids, versionId));
}
