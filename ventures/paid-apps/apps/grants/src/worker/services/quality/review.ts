// Funder rubric review: one quality.rubric_review call per drafted section (max 2 in flight),
// deterministic validation (validate.ts), funder-derived weights (scoring.ts), and storage in
// application_quality keyed by version. Advisory only: nothing here gates routing or submission.
import {
  type ApplicationContent,
  type DraftSection,
  type OpportunityRequirements,
  RequirementSection,
} from "@shared/content";
import {
  type CriterionScore,
  OpportunityCriterion,
  QUALITY_MAX_SCORE,
  type QualityReport,
  type QualitySuggestion,
  type SectionQuality,
} from "@shared/quality";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applicationQuality } from "../../db/schema/quality";
import { badRequest } from "../../lib/errors";
import { requirementSections, usableFacts } from "../drafting";
import type { DraftingFact, DraftingOpportunity } from "../drafting/types";
import {
  buildQualityContext,
  buildQualitySectionPrompt,
  formatCriteria,
  QUALITY_PROMPT_VERSION,
  QUALITY_PURPOSE,
  QUALITY_SYSTEM_PROMPT,
  RubricReviewOutput,
} from "./prompts";
import { assignWeights, criteriaForSection, defaultWeight, weightedAverage } from "./scoring";
import { type FinalizedCriterion, finalizeSectionReview, toInterviewQuestion } from "./validate";

const SECTION_CONCURRENCY = 2;

export interface QualityReviewInput {
  orgId: string;
  applicationId: string;
  versionId: string;
  content: ApplicationContent;
  requirements: OpportunityRequirements;
  opportunity: DraftingOpportunity;
  /** The facts the drafter could use (getFactsForDrafting); only these may be referenced. */
  facts: DraftingFact[];
  /** Published opportunity-level criteria (see opportunityCriteriaOf). */
  criteria?: OpportunityCriterion[];
}

export interface QualityReviewResult {
  report: QualityReport;
  model: string | null;
}

/** Opportunity-level rubric, when the parsed requirements carry one (`scoringCriteria`). */
export function opportunityCriteriaOf(rawRequirements: unknown): OpportunityCriterion[] {
  const raw = (rawRequirements ?? {}) as { scoringCriteria?: unknown };
  if (!Array.isArray(raw.scoringCriteria)) return [];
  const out: OpportunityCriterion[] = [];
  for (const item of raw.scoringCriteria) {
    const parsed = OpportunityCriterion.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const hasClaims = (s: DraftSection) => s.paragraphs.some((p) => p.claims.length > 0);

/** No drafted text: scored 0 without a model call; the drafter's gaps become interview questions. */
function emptySection(s: DraftSection): FinalizedCriterion[] {
  const suggestions: QualitySuggestion[] = s.gaps.slice(0, 4).map((g, i) => {
    const question = toInterviewQuestion(g.question);
    return {
      id: `${s.key}#c1.g${i + 1}`,
      kind: "missing_evidence",
      text: question,
      factIds: [],
      question,
    };
  });
  return [
    {
      criterion: "Answers the funder's question",
      score: 0,
      rationale:
        "This section has no drafted text yet, so a reviewer would score it as not addressed.",
      strengths: [],
      gaps: s.gaps
        .map((g) => g.why || g.question)
        .filter(Boolean)
        .slice(0, 6),
      suggestions,
      source: "section",
      publishedKey: null,
      publishedWeight: null,
    },
  ];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface SectionOutcome {
  sectionKey: string;
  title: string;
  status: SectionQuality["status"];
  criteria: FinalizedCriterion[];
  droppedFactIds: number;
  droppedSuggestions: number;
  model: string | null;
  error?: unknown;
}

export async function reviewApplicationQuality(
  ctx: AppContext,
  input: QualityReviewInput,
): Promise<QualityReviewResult> {
  const facts = usableFacts(input.facts);
  const factText = new Map(facts.map((f) => [f.id, `${f.statement} ${f.sourceQuote ?? ""}`]));
  const published = input.criteria ?? [];
  const reqs = requirementSections(input.requirements);
  const context = buildQualityContext({ opportunity: input.opportunity, facts });

  const outcomes = await mapLimit(
    input.content.sections,
    SECTION_CONCURRENCY,
    async (s, i): Promise<SectionOutcome> => {
      const requirement =
        reqs.find((r) => r.key === s.key) ??
        RequirementSection.parse({ key: s.key, title: s.title });
      const base = { sectionKey: s.key, title: s.title, droppedFactIds: 0, droppedSuggestions: 0 };
      if (requirement.kind === "attachment") {
        return { ...base, status: "skipped", criteria: [], model: null };
      }
      if (!hasClaims(s))
        return { ...base, status: "empty", criteria: emptySection(s), model: null };
      const applicable = criteriaForSection(published, s.key);
      try {
        const { data, usage } = await ctx.llm.generateStructured({
          purpose: QUALITY_PURPOSE,
          orgId: input.orgId,
          applicationId: input.applicationId,
          system: QUALITY_SYSTEM_PROMPT,
          context,
          prompt: buildQualitySectionPrompt({
            sectionIndex: i + 1,
            requirement,
            section: s,
            criteria: applicable,
          }),
          effort: "high",
          maxTokens: 16_000,
          schema: RubricReviewOutput,
        });
        const sectionText = s.paragraphs.flatMap((p) => p.claims.map((c) => c.text)).join(" ");
        const result = finalizeSectionReview(data, {
          sectionKey: s.key,
          facts: factText,
          sourceText: [
            sectionText,
            requirement.title,
            requirement.prompt,
            requirement.guidance,
            formatCriteria(applicable),
          ].join("\n"),
          published: applicable,
        });
        return {
          ...base,
          status: result.criteria.length ? "scored" : "failed",
          criteria: result.criteria,
          droppedFactIds: result.droppedFactIds,
          droppedSuggestions: result.droppedSuggestions,
          model: usage.model,
        };
      } catch (e) {
        ctx.logger.warn("quality.section_failed", {
          applicationId: input.applicationId,
          sectionKey: s.key,
          error: e instanceof Error ? e.name : String(e),
        });
        return { ...base, status: "failed", criteria: [], model: null, error: e };
      }
    },
  );

  const attempted = outcomes.filter((o) => o.status === "scored" || o.status === "failed");
  if (attempted.length > 0 && attempted.every((o) => o.status === "failed")) {
    // Nothing usable from the model: do not store a report, so a later run can try again.
    const err = attempted.find((o) => o.error)?.error;
    throw err instanceof Error ? err : new Error("quality review produced no scores");
  }

  const weights = assignWeights(
    outcomes.map((o) => o.criteria),
    published,
  );
  const sections: SectionQuality[] = outcomes.map((o, si) => {
    const criteria: CriterionScore[] = o.criteria.map((c, ci) => ({
      criterion: c.criterion,
      score: c.score,
      weight: weights[si]?.[ci] ?? defaultWeight(published),
      source: c.source,
      rationale: c.rationale,
      strengths: c.strengths,
      gaps: c.gaps,
      suggestions: c.suggestions,
    }));
    return {
      sectionKey: o.sectionKey,
      title: o.title,
      status: o.status,
      score: weightedAverage(criteria),
      criteria,
    };
  });
  const report: QualityReport = {
    versionId: input.versionId,
    overallScore: weightedAverage(sections.flatMap((s) => s.criteria)),
    maxScore: QUALITY_MAX_SCORE,
    sections,
    droppedFactIds: outcomes.reduce((n, o) => n + o.droppedFactIds, 0),
    droppedSuggestions: outcomes.reduce((n, o) => n + o.droppedSuggestions, 0),
    promptVersion: QUALITY_PROMPT_VERSION,
    checkedAt: ctx.now().getTime(),
  };
  return { report, model: outcomes.find((o) => o.model)?.model ?? null };
}

// ---------------------------------------------------------------------------------------------
// Storage (application_quality, tenant-scoped)
// ---------------------------------------------------------------------------------------------

export interface QualityIds {
  orgId: string;
  applicationId: string;
}

export type QualityRow = typeof applicationQuality.$inferSelect;

export async function saveQualityReport(
  ctx: AppContext,
  input: QualityIds & { versionId: string; report: QualityReport; model: string | null },
): Promise<void> {
  await ctx.db
    .insert(applicationQuality)
    .values({
      versionId: input.versionId,
      orgId: input.orgId,
      applicationId: input.applicationId,
      report: input.report,
      model: input.model,
    })
    .onConflictDoUpdate({
      target: applicationQuality.versionId,
      set: { report: input.report, model: input.model, createdAt: ctx.now() },
    });
}

/** The report for `versionId`, or the application's latest report when omitted. */
export async function loadQualityReport(
  ctx: AppContext,
  ids: QualityIds,
  versionId?: string | null,
): Promise<QualityRow | undefined> {
  const where = [
    eq(applicationQuality.orgId, ids.orgId),
    eq(applicationQuality.applicationId, ids.applicationId),
  ];
  if (versionId) where.push(eq(applicationQuality.versionId, versionId));
  return ctx.db
    .select()
    .from(applicationQuality)
    .where(and(...where))
    .orderBy(desc(applicationQuality.createdAt))
    .get();
}

// ---------------------------------------------------------------------------------------------
// Using a report: apply suggestions (redraft instructions) and missing-evidence questions
// ---------------------------------------------------------------------------------------------

/**
 * The chosen suggestions of one section. Unknown ids, ids from another section and
 * missing_evidence suggestions (those are answered in an interview, never drafted) are rejected.
 */
export function selectSuggestions(
  report: QualityReport,
  sectionKey: string,
  suggestionIds: readonly string[],
): QualitySuggestion[] {
  const section = report.sections.find((s) => s.sectionKey === sectionKey);
  if (!section) throw badRequest(`No quality review for section "${sectionKey}"`);
  const byId = new Map(section.criteria.flatMap((c) => c.suggestions).map((s) => [s.id, s]));
  const out: QualitySuggestion[] = [];
  for (const id of new Set(suggestionIds)) {
    const s = byId.get(id);
    if (!s) throw badRequest(`Unknown suggestion "${id}" for section "${sectionKey}"`);
    if (s.kind === "missing_evidence") {
      throw badRequest("Missing-evidence suggestions are answered in an interview, not drafted");
    }
    out.push(s);
  }
  if (out.length === 0) throw badRequest("Choose at least one suggestion");
  return out;
}

/** Redraft instructions from chosen suggestions (guidance only; the drafter's rules still apply). */
export function suggestionsToInstructions(suggestions: readonly QualitySuggestion[]): string {
  const lines = suggestions.map((s) => {
    const facts = s.factIds.length ? ` (facts: ${s.factIds.join(", ")})` : "";
    return `- [${s.kind}] ${s.text}${facts}`;
  });
  return [
    "Revise this section to score higher against the funder's criteria by applying these reviewer suggestions. They are guidance, not evidence: assert only what the cited facts support, and add a gap for anything a suggestion needs that no fact provides.",
    ...lines,
  ].join("\n");
}

/** Interview questions from missing_evidence suggestions (all, or the chosen ids). */
export function missingEvidenceQuestions(
  report: QualityReport,
  suggestionIds?: readonly string[],
): string[] {
  const wanted = suggestionIds?.length ? new Set(suggestionIds) : null;
  const out: string[] = [];
  for (const sec of report.sections)
    for (const c of sec.criteria)
      for (const s of c.suggestions) {
        if (s.kind !== "missing_evidence" || (wanted && !wanted.has(s.id))) continue;
        const q = (s.question ?? toInterviewQuestion(s.text)).trim();
        if (q && !out.includes(q)) out.push(q);
      }
  return out;
}
