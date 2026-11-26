// Review-tier routing policy (pure). Decides how much human attention a prepared application gets:
//   auto        – the automation level lets autopilot submit, every autopilot gate passes and every
//                 SAFETY RAIL holds (see safety-rails.ts; rails are not configurable)
//   full_review – high value, high likelihood (below `full`), blocking flags, or the level requires
//                 a full review of every draft (`requireDraftReview`, e.g. `manual`)
//   one_click   – everything else: a human approves the prepared package with one click
// The automation level and per-stage overrides are resolved by automation.ts (resolveAutomation).
import type { ReviewTier } from "@shared/enums";
import type { orgSettings } from "../../db/schema";
import {
  type AutomationSettings,
  type EffectiveAutomation,
  presetDefaults,
  requiredApprovals,
  resolveAutomation,
} from "./automation";
import { type SafetyRailFacts, safetyRailFailures } from "./safety-rails";

type OrgSettingsRow = typeof orgSettings.$inferSelect;

export type ReviewPolicySettings = Pick<
  OrgSettingsRow,
  | "autopilotEnabled"
  | "autoSubmitMaxCents"
  | "fullReviewAboveCents"
  | "minFitScoreForAuto"
  | "highLikelihoodThreshold"
  | "reviewFirstSubmissionPerFunder"
  | "maxAutoSubmissionsPerMonth"
> &
  AutomationSettings;

/**
 * Inputs for routing. The safety-rail facts that are optional here (consent, deadline, billing,
 * injection warnings, verified recipient) FAIL their rail when omitted: unknown never auto-submits.
 */
export interface ReviewPolicyInput
  extends Omit<
    SafetyRailFacts,
    "groundingPassed" | "openBlockers" | "unconfirmedCitations" | "hasHumanEdits"
  > {
  settings: ReviewPolicySettings;
  /** null when we do not know the ask (never auto-submitted). */
  requestedAmountCents: number | null;
  /** 0-100, null when the opportunity was never scored. */
  fitScore: number | null;
  /** 0-1, null when unknown. */
  likelihood: number | null;
  groundingPassed: boolean;
  openBlockers: number;
  /** Claims citing facts that are only `proposed` (not human-confirmed). */
  unconfirmedCitations: number;
  isFirstSubmissionToFunder: boolean;
  autoSubmissionsThisMonth: number;
  /** Whether the opportunity can be submitted without a human (e.g. email with a known address). */
  submissionChannelSupportsAuto: boolean;
  /**
   * The current version was written by a person, or a person edited the draft since the last
   * approval. Autopilot never submits human-edited text: a human must approve it explicitly.
   */
  hasHumanEdits: boolean;
}

export interface ReviewTierDecision {
  tier: ReviewTier;
  /** Human-readable, shown in the UI and the audit log. */
  reasons: string[];
  /** The automation config the decision was made under (level in effect, overrides). */
  automation: EffectiveAutomation;
  /** Distinct approving reviewers a human-approved submission needs (two-person rule). */
  requiredApprovals: 1 | 2;
}

export const formatUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Reasons the application needs section-by-section human review (empty = not required). */
export function fullReviewReasons(
  input: ReviewPolicyInput,
  config: EffectiveAutomation = resolveAutomation(input.settings),
): string[] {
  const { settings: s } = input;
  const reasons: string[] = [];
  // `full` drops the amount and likelihood thresholds; blockers always need a person.
  if (config.riskThresholds) {
    if (
      input.requestedAmountCents !== null &&
      input.requestedAmountCents > s.fullReviewAboveCents
    ) {
      reasons.push(
        `Requested amount ${formatUsd(input.requestedAmountCents)} is above the full-review threshold of ${formatUsd(s.fullReviewAboveCents)}`,
      );
    }
    if (input.likelihood !== null && input.likelihood >= s.highLikelihoodThreshold) {
      reasons.push(
        `High likelihood of award (${pct(input.likelihood)} ≥ ${pct(s.highLikelihoodThreshold)}) — worth a careful human review`,
      );
    }
  }
  if (input.openBlockers > 0) {
    reasons.push(`${plural(input.openBlockers, "blocking flag")} must be resolved by a human`);
  }
  if (config.requireDraftReview) {
    reasons.push(
      `Draft review is required (automation level "${presetDefaults(config.level).label}"): a person reviews every section`,
    );
  }
  return reasons;
}

/** Autopilot gates that fail (empty = the application may be auto-submitted). */
export function autopilotGateFailures(
  input: ReviewPolicyInput,
  config: EffectiveAutomation = resolveAutomation(input.settings),
): string[] {
  const { settings: s } = input;
  const failures: string[] = [];
  if (!presetDefaults(config.level).autoSubmit) {
    failures.push(
      `Autopilot is turned off for this organization (automation level "${presetDefaults(config.level).label}": a person approves every submission)`,
    );
  } else if (config.requireSubmissionApproval) {
    failures.push("Submission approval is required: a person approves every submission");
  }
  if (config.riskThresholds) {
    if (input.requestedAmountCents === null) {
      failures.push("Requested amount is unknown");
    } else if (input.requestedAmountCents > s.autoSubmitMaxCents) {
      failures.push(
        `Requested amount ${formatUsd(input.requestedAmountCents)} exceeds the autopilot limit of ${formatUsd(s.autoSubmitMaxCents)}`,
      );
    }
    if (input.fitScore === null) {
      failures.push("Fit score is unknown");
    } else if (input.fitScore < s.minFitScoreForAuto) {
      failures.push(
        `Fit score ${input.fitScore} is below the autopilot minimum of ${s.minFitScoreForAuto}`,
      );
    }
    if (input.likelihood === null) {
      failures.push("Likelihood of award is unknown");
    } else if (input.likelihood >= s.highLikelihoodThreshold) {
      failures.push("High-likelihood grants always get a human review");
    }
  }
  if (s.reviewFirstSubmissionPerFunder && input.isFirstSubmissionToFunder) {
    failures.push("First submission to this funder requires a human review");
  }
  if (input.autoSubmissionsThisMonth >= s.maxAutoSubmissionsPerMonth) {
    failures.push(
      `Monthly autopilot cap reached (${input.autoSubmissionsThisMonth}/${s.maxAutoSubmissionsPerMonth})`,
    );
  }
  if (requiredApprovals(config, input.requestedAmountCents) > 1) {
    failures.push(twoPersonReason(config, input.requestedAmountCents));
  }
  // SAFETY RAILS (not configurable). Order kept stable for the reasons shown in the UI.
  const rails = safetyRailFailures(input);
  const railMsg = (rail: string) => rails.find((r) => r.rail === rail)?.message;
  for (const rail of ["grounding_not_passed", "open_blockers", "unconfirmed_citations"]) {
    const m = railMsg(rail);
    if (m) failures.push(m);
  }
  if (!input.submissionChannelSupportsAuto) {
    failures.push("This funder's submission channel cannot be submitted automatically");
  }
  for (const r of rails) {
    if (["grounding_not_passed", "open_blockers", "unconfirmed_citations"].includes(r.rail)) {
      continue;
    }
    failures.push(r.message);
  }
  return failures;
}

function twoPersonReason(config: EffectiveAutomation, ask: number | null): string {
  const threshold = formatUsd(config.twoPersonRuleAboveCents ?? 0);
  return ask === null
    ? `Two different reviewers must approve: the ask is unknown and the two-person rule applies above ${threshold}`
    : `Two different reviewers must approve: the ask ${formatUsd(ask)} is above the two-person threshold of ${threshold}`;
}

export function decideReviewTier(input: ReviewPolicyInput): ReviewTierDecision {
  const automation = resolveAutomation(input.settings);
  const approvals = requiredApprovals(automation, input.requestedAmountCents);
  const withTwoPerson = (reasons: string[]) =>
    approvals > 1 && !reasons.some((r) => r.startsWith("Two different reviewers"))
      ? [...reasons, twoPersonReason(automation, input.requestedAmountCents)]
      : reasons;
  const base = { automation, requiredApprovals: approvals };
  const full = fullReviewReasons(input, automation);
  if (full.length > 0) return { ...base, tier: "full_review", reasons: withTwoPerson(full) };
  const failures = autopilotGateFailures(input, automation);
  if (failures.length === 0) {
    const ask = formatUsd(input.requestedAmountCents ?? 0);
    return {
      ...base,
      tier: "auto",
      reasons: [
        automation.riskThresholds
          ? `All autopilot gates passed: ask ${ask} ≤ ${formatUsd(input.settings.autoSubmitMaxCents)}, fit ${input.fitScore}, grounding passed, zero blockers, all cited facts confirmed`
          : `Full autopilot: every safety rail passed (ask ${ask}, grounding passed, zero blockers, all cited facts confirmed) and the monthly cap is not reached`,
      ],
    };
  }
  return { ...base, tier: "one_click", reasons: withTwoPerson(failures) };
}

export const reasonsToText = (reasons: string[]) => reasons.join("; ");
