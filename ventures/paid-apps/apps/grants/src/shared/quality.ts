// Funder rubric scoring contracts (worker <-> client). A quality report scores each drafted section
// against the funder's own criteria (section guidance + prompt, plus opportunity-level criteria when
// published) and suggests improvements. Suggestions only reference existing fact ids (validated
// deterministically); "missing_evidence" suggestions become interview questions, never draft text.
import { z } from "zod";

export const QUALITY_SUGGESTION_KINDS = [
  "restructure",
  "emphasize",
  "clarify",
  "missing_evidence",
] as const;
export type QualitySuggestionKind = (typeof QUALITY_SUGGESTION_KINDS)[number];

/** Highest score per criterion. */
export const QUALITY_MAX_SCORE = 5;

export const QualitySuggestion = z.object({
  /** Stable within a report: "{sectionKey}#c{criterion}.g{suggestion}" (1-based). */
  id: z.string(),
  kind: z.enum(QUALITY_SUGGESTION_KINDS),
  text: z.string(),
  /** Existing fact ids only (unknown ids are removed before the report is stored). */
  factIds: z.array(z.string()).default([]),
  /** missing_evidence only: the question to ask staff (gap-fill interview). */
  question: z.string().nullable().default(null),
});
export type QualitySuggestion = z.infer<typeof QualitySuggestion>;

export const CriterionScore = z.object({
  criterion: z.string(),
  /** 0-5 (integer). */
  score: z.number().min(0).max(QUALITY_MAX_SCORE),
  /** Weight in the weighted averages (published points when the funder gives them). */
  weight: z.number().nonnegative(),
  /** "opportunity" when it matched a published opportunity-level criterion. */
  source: z.enum(["section", "opportunity"]).default("section"),
  rationale: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  suggestions: z.array(QualitySuggestion).default([]),
});
export type CriterionScore = z.infer<typeof CriterionScore>;

export const SectionQuality = z.object({
  sectionKey: z.string(),
  title: z.string(),
  /** scored | empty (no drafted text: scored 0 deterministically) | failed (model) | skipped (attachment) */
  status: z.enum(["scored", "empty", "failed", "skipped"]),
  /** Weighted average of the section's criteria, null when nothing was scored. */
  score: z.number().nullable(),
  criteria: z.array(CriterionScore).default([]),
});
export type SectionQuality = z.infer<typeof SectionQuality>;

export const QualityReport = z.object({
  versionId: z.string(),
  /** Weighted average over every scored criterion (0-5), null when nothing was scored. */
  overallScore: z.number().nullable(),
  maxScore: z.number().default(QUALITY_MAX_SCORE),
  sections: z.array(SectionQuality),
  /** Fact ids the model cited that do not exist in the fact base (removed). */
  droppedFactIds: z.number().int().default(0),
  /** Suggestions removed by the deterministic checks (unknown facts, unsupported numbers). */
  droppedSuggestions: z.number().int().default(0),
  promptVersion: z.string(),
  checkedAt: z.number().int(), // epoch ms
});
export type QualityReport = z.infer<typeof QualityReport>;

/** GET /applications/:id/quality */
export interface QualityReportDto {
  versionId: string;
  applicationId: string;
  /** false when this report scores an older version than the application's current one. */
  current: boolean;
  report: QualityReport;
  model: string | null;
  createdAt: string;
}

/**
 * Opportunity-level scoring criteria, when the funder publishes a rubric ("Need: 25 points").
 * Read defensively from `opportunities.requirements.scoringCriteria` (not yet part of
 * OpportunityRequirements in @shared/content).
 */
export const OpportunityCriterion = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  /** Published points or weight; null when the funder gives none. */
  weight: z.number().positive().nullable().default(null),
  /** Sections this criterion applies to; empty = every narrative section. */
  sectionKeys: z.array(z.string()).default([]),
});
export type OpportunityCriterion = z.infer<typeof OpportunityCriterion>;

/** POST /applications/:id/quality/apply */
export const ApplyQualityBody = z.object({
  sectionKey: z.string().min(1),
  suggestionIds: z.array(z.string().min(1)).min(1).max(30),
});
export type ApplyQualityBody = z.infer<typeof ApplyQualityBody>;

/** POST /applications/:id/quality/interview */
export const QualityInterviewBody = z.object({
  /** Limit to these missing_evidence suggestions (default: all in the current report). */
  suggestionIds: z.array(z.string().min(1)).max(30).optional(),
});
export type QualityInterviewBody = z.infer<typeof QualityInterviewBody>;
