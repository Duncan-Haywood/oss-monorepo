// Quality report actions behind /applications/:id/quality: read the report, apply chosen
// suggestions (a grounded redraft of one section via `regenerate`, re-verified as usual), and turn
// missing-evidence suggestions into a gap-fill interview (never into draft text).
import { QualityReport, type QualityReportDto } from "@shared/quality";
import type { AppContext } from "../../context";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { createGapFillInterview } from "../interview";
import { audit } from "../privacy/audit";
import {
  loadQualityReport,
  missingEvidenceQuestions,
  type QualityRow,
  selectSuggestions,
  suggestionsToInstructions,
} from "../quality";
import { type ApplicationRow, regenerate } from "./index";
import { type AppIds, loadApplication } from "./steps";

function toDto(row: QualityRow, app: ApplicationRow): QualityReportDto {
  return {
    versionId: row.versionId,
    applicationId: row.applicationId,
    current: row.versionId === app.currentVersionId,
    report: QualityReport.parse(row.report),
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The current version's report, else the latest one (marked `current: false`); 404 if none. */
export async function getApplicationQuality(
  ctx: AppContext,
  ids: AppIds,
): Promise<QualityReportDto> {
  const app = await loadApplication(ctx, ids); // 404 for other tenants' ids
  const row =
    (app.currentVersionId ? await loadQualityReport(ctx, ids, app.currentVersionId) : undefined) ??
    (await loadQualityReport(ctx, ids));
  if (!row) throw notFound("Quality report");
  return toDto(row, app);
}

async function currentReport(ctx: AppContext, ids: AppIds) {
  const app = await loadApplication(ctx, ids);
  if (!app.currentVersionId) throw conflict("This application has no draft yet");
  const row = await loadQualityReport(ctx, ids, app.currentVersionId);
  if (!row) throw conflict("The quality review of the current draft is not ready yet");
  return { app, report: QualityReport.parse(row.report) };
}

export async function applyQualitySuggestions(
  ctx: AppContext,
  input: AppIds & {
    sectionKey: string;
    suggestionIds: string[];
    userId: string;
    requestId?: string;
  },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const { app, report } = await currentReport(ctx, ids);
  const chosen = selectSuggestions(report, input.sectionKey, input.suggestionIds);
  const title =
    report.sections.find((s) => s.sectionKey === input.sectionKey)?.title ?? input.sectionKey;
  const updated = await regenerate(ctx, {
    ...ids,
    sectionKey: input.sectionKey,
    instructions: suggestionsToInstructions(chosen),
    userId: input.userId,
    requestId: input.requestId,
    changeNote: `Applied ${chosen.length} quality suggestion${chosen.length === 1 ? "" : "s"} to "${title}"`,
  });
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.quality_applied",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: {
      fromVersionId: app.currentVersionId,
      versionId: updated.currentVersionId,
      sectionKey: input.sectionKey,
      suggestionIds: chosen.map((s) => s.id),
      kinds: chosen.map((s) => s.kind),
    },
    requestId: input.requestId,
  });
  return updated;
}

/** Ask the missing-evidence questions in a gap-fill interview (opened or extended). */
export async function startQualityInterview(
  ctx: AppContext,
  input: AppIds & { suggestionIds?: string[]; userId: string },
): Promise<{ interviewId: string; questions: number }> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const { report } = await currentReport(ctx, ids);
  const questions = missingEvidenceQuestions(report, input.suggestionIds);
  if (questions.length === 0) throw badRequest("No missing-evidence questions to ask");
  const { interviewId } = await createGapFillInterview(ctx, {
    ...ids,
    questions,
    userId: input.userId,
  });
  return { interviewId, questions: questions.length };
}
