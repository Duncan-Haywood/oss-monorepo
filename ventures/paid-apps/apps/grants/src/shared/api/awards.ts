// Post-award reporting contracts (services/awards, routes/org/awards.ts). The report content keeps
// the application's anti-fabrication shape (sections -> paragraphs -> cited claims, gaps) and adds a
// promised-vs-achieved table whose "achieved" side may only come from facts dated in the period.
import type * as s from "@worker/db/schema/awards";
import { z } from "zod";
import { DraftSection, type GroundingReport } from "../content";
import type { FlagKind, FlagSeverity } from "../enums";
import type { FactDto, FollowupDto, Serialized } from "./types";

export const AWARD_REPORT_KINDS = ["interim", "final", "financial", "other"] as const;
export type AwardReportKind = (typeof AWARD_REPORT_KINDS)[number];

export const AWARD_REPORT_STATUSES = ["upcoming", "drafting", "in_review", "submitted"] as const;
export type AwardReportStatus = (typeof AWARD_REPORT_STATUSES)[number];

export const COMPARISON_STATUSES = ["met", "partially_met", "not_met", "unknown"] as const;
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

/** One goal the application promised, and what the period's facts show was achieved. */
export const PromiseComparison = z.object({
  /** "g1", "g2"… (stable within a report version). */
  goalId: z.string(),
  /** The application's sentence, verbatim. A promise, never evidence of achievement. */
  promised: z.string(),
  /** Claim id in the application version it came from. */
  sourceClaimId: z.string().nullable().default(null),
  /** What was achieved, restated from cited in-period facts; null when no fact says. */
  achieved: z.string().nullable().default(null),
  status: z.enum(COMPARISON_STATUSES).default("unknown"),
  /** In-period outcome / metric facts that support `achieved` (empty when unknown). */
  factIds: z.array(z.string()).default([]),
});
export type PromiseComparison = z.infer<typeof PromiseComparison>;

export const ReportContent = z.object({
  sections: z.array(DraftSection),
  comparisons: z.array(PromiseComparison).default([]),
});
export type ReportContent = z.infer<typeof ReportContent>;

/** The comparisons table is verified as this pseudo-section (claim ids "cmp.<goalId>"). */
export const COMPARISON_SECTION_KEY = "promised_vs_achieved";
export const comparisonClaimId = (goalId: string) => `cmp.${goalId}`;

/** A verifier flag on a report (stored on the report row; reports have no flags table). */
export interface ReportFlag {
  severity: FlagSeverity;
  kind: FlagKind;
  sectionKey: string | null;
  claimId: string | null;
  message: string;
  suggestedQuestion: string | null;
}

export type AwardDto = Serialized<typeof s.awards.$inferSelect>;
export type AwardReportDto = Serialized<typeof s.awardReports.$inferSelect>;

/** GET /awards → items. */
export type AwardListItem = AwardDto & {
  reports: AwardReportDto[];
  /** The earliest report not yet submitted, if any. */
  nextReport: AwardReportDto | null;
};

/** GET /awards/:id */
export type AwardDetail = AwardDto & {
  reports: AwardReportDto[];
  application: { id: string; title: string; status: string } | null;
  followups: FollowupDto[];
};

/** GET /awards/:id/reports/:reportId */
export type AwardReportDetail = AwardReportDto & {
  award: AwardDto;
  /** Facts cited anywhere in the report (claims and comparisons). */
  citedFacts: FactDto[];
  /** Questions the draft could not answer from in-period facts. */
  gaps: { sectionKey: string; question: string; why: string }[];
  /** The latest check-in interview opened for this report's gaps. */
  checkinInterview: { id: string; status: string; title: string } | null;
};

export type { GroundingReport };
