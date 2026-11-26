// Pure ranking / eligibility / trap metrics for the sourcing evals.
import type { Eligibility } from "@shared/enums";
import type { GoldLabel, TrapKind } from "./fixtures/types";

/**
 * Graded gain for NDCG: the gold relevance, zeroed when the org is gold-ineligible (an ineligible
 * grant in the shortlist wastes review time however on-topic it is).
 */
export const gainOf = (g: GoldLabel): number => (g.eligible === false ? 0 : g.relevance);

const dcg = (gains: readonly number[], k: number) =>
  gains.slice(0, k).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);

/**
 * NDCG@k of the surfaced ranking. `ranked` = gains of the surfaced list in rank order (dropped
 * opportunities are simply absent); `all` = gains of every labeled opportunity (for the ideal).
 * 1 when nothing is relevant at all.
 */
export function ndcgAt(ranked: readonly number[], all: readonly number[], k: number): number {
  const ideal = dcg(
    [...all].sort((a, b) => b - a),
    k,
  );
  return ideal === 0 ? 1 : dcg(ranked, k) / ideal;
}

/** Share of the top-k slots holding a relevant (gain >= 1) item; empty slots count as misses. */
export function precisionAt(ranked: readonly number[], k: number): number {
  return ranked.slice(0, k).filter((g) => g >= 1).length / k;
}

/** The pipeline's verdict reduced to the gold scale. */
export function eligibilityClaim(e: Eligibility): boolean | "unknown" {
  if (e === "eligible" || e === "likely_eligible") return true;
  if (e === "ineligible") return false;
  return "unknown";
}

export const eligibilityCorrect = (gold: GoldLabel["eligible"], e: Eligibility) =>
  eligibilityClaim(e) === gold;

/** The safety failure: the pipeline calls the org (likely) eligible when gold says no / unknown. */
export const isFalseEligible = (gold: GoldLabel["eligible"], e: Eligibility) =>
  eligibilityClaim(e) === true && gold !== true;

export interface CaseOutcome {
  /** Dropped by the deterministic prefilter. */
  droppedByPrefilter: boolean;
  /** Collapsed onto another listing by findNearDuplicates. */
  duplicateOf: string | null;
  /** Final verdict (prefilter's for dropped cases, the scored match's otherwise). */
  eligibility: Eligibility;
  fitScore: number | null;
  /** 1-based rank in the surfaced list, null when not surfaced. */
  rank: number | null;
}

/**
 * Traps only a model that reads the listing can catch. FakeLlm scores by keyword overlap, so under
 * --fake these are reported but not gated (the deterministic traps always are).
 */
export const MODEL_JUDGED_TRAPS: ReadonlySet<TrapKind> = new Set<TrapKind>(["keyword_stuffed"]);

/** Ranked at or above this position counts as "surfaced to a human" for the keyword-stuffing trap. */
export const STUFFED_MAX_RANK = 5;

/** Whether the pipeline neutralized a trap. */
export function trapCaught(kind: TrapKind, o: CaseOutcome, minFit: number): boolean {
  const dropped = o.droppedByPrefilter || o.duplicateOf !== null;
  switch (kind) {
    case "tribal_gov_only":
    case "for_profit_only":
    case "wrong_state":
      return dropped || o.eligibility === "ineligible";
    case "deadline_passed":
    case "ceiling_below_min":
      return o.droppedByPrefilter;
    case "near_duplicate":
      return o.duplicateOf !== null;
    case "keyword_stuffed":
      return dropped || ((o.fitScore ?? 0) < minFit && (o.rank ?? Infinity) > STUFFED_MAX_RANK);
    case "sam_no_uei":
      return eligibilityClaim(o.eligibility) !== true;
  }
}

/**
 * Of the model's raw reasons that cite at least one fact id, the share whose ids are all real
 * (in the fact list it was given). Measured BEFORE finalizeScore strips unknown ids.
 */
export function realCitationShare(
  reasons: readonly { factIds: readonly string[] }[],
  allowed: ReadonlySet<string>,
): { citing: number; allReal: number; fabricatedIds: string[] } {
  const citing = reasons.filter((r) => r.factIds.length > 0);
  const fabricatedIds = citing.flatMap((r) => r.factIds.filter((id) => !allowed.has(id)));
  return {
    citing: citing.length,
    allReal: citing.filter((r) => r.factIds.every((id) => allowed.has(id))).length,
    fabricatedIds: [...new Set(fabricatedIds)],
  };
}
