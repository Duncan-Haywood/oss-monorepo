// Application export (DOCX / printable HTML / portal plain text). Public API of the export module.
// loadExportInput reads through the applications read model, so every row is tenant-scoped and an
// application id from another org is a 404.
import type { AppContext } from "../../context";
import { conflict, notFound } from "../../lib/errors";
import { getBudget } from "../budgets";
import { getFactsByIds } from "../knowledge";
import { getOrgProfile } from "../orgs";
import { getApplicationDetail } from "../pipeline/queries";
import { citedFactIds, loadVersion, requirementsOf } from "../pipeline/steps";
import { buildApplicationDocx, DOCX_CONTENT_TYPE } from "./docx";
import { buildApplicationHtml, HTML_CONTENT_TYPE } from "./html";
import type { ExportInput, ExportOptions } from "./model";
import { buildApplicationText, TEXT_CONTENT_TYPE } from "./plaintext";
import { exportFilename } from "./text";

export { buildApplicationDocx, DOCX_CONTENT_TYPE } from "./docx";
export { buildApplicationHtml, HTML_CONTENT_TYPE } from "./html";
export type { ExportInput, ExportModel, ExportOptions } from "./model";
export { buildExportModel, numberCitations } from "./model";
export { buildApplicationText, TEXT_CONTENT_TYPE } from "./plaintext";

export const EXPORT_FORMATS = ["docx", "html", "txt"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Loads one version (the current one unless `versionId` is given) with everything an export shows. */
export async function loadExportInput(
  ctx: AppContext,
  ids: { orgId: string; applicationId: string; versionId?: string },
): Promise<ExportInput> {
  const { orgId, applicationId } = ids;
  const detail = await getApplicationDetail(ctx, orgId, applicationId);
  let version = detail.currentVersion;
  let facts = detail.citedFacts;
  if (ids.versionId && ids.versionId !== version?.id) {
    version = (await loadVersion(ctx, { orgId, applicationId }, ids.versionId)) ?? null;
    if (!version) throw notFound("Version");
    const cited = citedFactIds(version.content);
    facts = cited.length > 0 ? await getFactsByIds(ctx, orgId, cited) : [];
  }
  if (!version) throw conflict("This application has no draft to export yet");
  const [profile, budget] = await Promise.all([
    getOrgProfile(ctx, orgId),
    getBudget(ctx, { orgId, applicationId }),
  ]);
  const opp = detail.opportunity;
  return {
    generatedAt: ctx.now(),
    org: { legalName: profile.legalName, dba: profile.dba, ein: profile.ein, uei: profile.uei },
    application: {
      id: detail.id,
      title: detail.title,
      requestedAmountCents: detail.requestedAmountCents,
      deadline: detail.deadline,
    },
    opportunity: {
      title: opp.title,
      funderName: opp.funderName,
      opportunityNumber: opp.opportunityNumber,
      closeDate: opp.closeDate,
    },
    // The drafter answered these (parsed RFP, or the generic fallback sections).
    requirements: requirementsOf(opp),
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      content: version.content,
      executiveSummary: version.executiveSummary,
      keyPoints: version.keyPoints,
    },
    facts: facts.map((f) => ({ id: f.id, statement: f.statement, sourceQuote: f.sourceQuote })),
    budget: budget.lines.length ? { lines: budget.lines, notes: budget.notes } : null,
  };
}

export interface RenderedExport {
  body: Uint8Array | string;
  contentType: string;
  filename: string;
}

export function renderExport(
  input: ExportInput,
  format: ExportFormat,
  options: ExportOptions = {},
): RenderedExport {
  const name = {
    orgName: input.org.legalName,
    title: input.application.title,
    versionNumber: input.version.versionNumber,
  };
  switch (format) {
    case "docx":
      return {
        body: buildApplicationDocx(input, options),
        contentType: DOCX_CONTENT_TYPE,
        filename: exportFilename(name, "docx"),
      };
    case "html":
      return {
        body: buildApplicationHtml(input, options),
        contentType: HTML_CONTENT_TYPE,
        filename: exportFilename(name, "html"),
      };
    case "txt":
      return {
        body: buildApplicationText(input, options),
        contentType: TEXT_CONTENT_TYPE,
        filename: exportFilename(name, "txt"),
      };
  }
}
