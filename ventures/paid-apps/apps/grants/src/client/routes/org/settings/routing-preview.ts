// Client-side APPROXIMATION of the review routing in worker/services/review/policy.ts
// (decideReviewTier), including the automation levels (review/automation.ts) and the safety rails
// (review/safety-rails.ts), with friendlier wording. Used only for the "how would this be routed?"
// preview when GET /settings/automation-preview is unavailable or the settings have unsaved
// changes; the server's pipeline is authoritative.
import {
  type AutomationSettingsSource,
  LEVEL_META,
  levelSubmitsOnItsOwn,
  readAutomation,
} from "@client/components/automation/levels";
import { formatCents } from "@client/lib/api";
import type { OrgSettingsDto } from "@shared/api/types";
import type { ReviewTier } from "@shared/enums";

export type RoutingPolicy = Pick<
  OrgSettingsDto,
  | "autopilotEnabled"
  | "autoSubmitMaxCents"
  | "fullReviewAboveCents"
  | "minFitScoreForAuto"
  | "highLikelihoodThreshold"
  | "reviewFirstSubmissionPerFunder"
  | "maxAutoSubmissionsPerMonth"
> &
  /** No automationLevel = a pre-levels row: autopilotEnabled → Supervised, else Prepared. */
  Omit<AutomationSettingsSource, "autopilotEnabled">;

export interface RoutingInput {
  /** Requested amount in cents. */
  askCents: number;
  /** Fit score 0-100. */
  fitScore: number;
  /** Likelihood of award 0-1. */
  likelihood: number;
  /** True if the org has never submitted to this funder before. */
  firstSubmissionToFunder: boolean;
  /** Auto-submissions already made this month. */
  autoSubmissionsThisMonth: number;
  groundingPassed: boolean;
  openBlockers: number;
  allCitedFactsConfirmed: boolean;
  /** Whether the funder accepts submissions we can send without a person (e.g. by email). */
  channelSupportsAuto: boolean;
}

export interface RoutingResult {
  tier: ReviewTier;
  /** Plain-language reasons, most important first. Never empty. */
  reasons: string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * full_review – large ask or good chance of winning (except at Full autopilot), open blockers, or
 *               "review every draft" (Manual).
 * auto        – the level submits on its own, submission approval isn't required, every gate
 *               passes (risk thresholds only below Full) and every safety rail holds.
 * one_click   – everything else (a person approves a prepared package with one click).
 * Safety rails this preview can't know (consent, verified email, deadline, billing, injection
 * warnings, human edits) are assumed to pass.
 */
export function routeApplication(policy: RoutingPolicy, input: RoutingInput): RoutingResult {
  const a = readAutomation(policy);
  const level = a.automationLevel;
  const riskThresholds = level !== "full";
  const twoPerson = a.twoPersonRuleAboveCents != null && input.askCents > a.twoPersonRuleAboveCents;
  const withTwoPerson = (reasons: string[]) =>
    twoPerson
      ? [
          ...reasons,
          `Asks for more than ${formatCents(a.twoPersonRuleAboveCents)}, so two different people must approve`,
        ]
      : reasons;

  const full: string[] = [];
  if (riskThresholds && input.askCents > policy.fullReviewAboveCents) {
    full.push(
      `Asks for ${formatCents(input.askCents)}, above your ${formatCents(policy.fullReviewAboveCents)} full-review line`,
    );
  }
  if (riskThresholds && input.likelihood >= policy.highLikelihoodThreshold) {
    full.push(
      `Good chance of winning (${pct(input.likelihood)} ≥ ${pct(policy.highLikelihoodThreshold)}) — worth a careful read`,
    );
  }
  if (input.openBlockers > 0) {
    full.push(`${plural(input.openBlockers, "blocking issue")} must be resolved by a person`);
  }
  if (a.requireDraftReview) {
    full.push(
      level === "manual"
        ? "Manual: a person reads every section of every application"
        : "You chose to review every draft in full",
    );
  }
  if (full.length > 0) return { tier: "full_review", reasons: withTwoPerson(full) };

  const gates: string[] = [];
  if (!levelSubmitsOnItsOwn(level)) {
    gates.push(
      policy.automationLevel
        ? `${LEVEL_META[level].label}: a person approves every submission`
        : "Autopilot is off",
    );
  } else if (a.requireSubmissionApproval) {
    gates.push("You chose to approve every submission");
  }
  if (riskThresholds && input.askCents > policy.autoSubmitMaxCents) {
    gates.push(
      `Asks for ${formatCents(input.askCents)}, above your ${formatCents(policy.autoSubmitMaxCents)} auto-submit limit`,
    );
  }
  if (riskThresholds && input.fitScore < policy.minFitScoreForAuto) {
    gates.push(`Fit score ${input.fitScore} is below your minimum of ${policy.minFitScoreForAuto}`);
  }
  if (policy.reviewFirstSubmissionPerFunder && input.firstSubmissionToFunder) {
    gates.push("First application to this funder");
  }
  if (input.autoSubmissionsThisMonth >= policy.maxAutoSubmissionsPerMonth) {
    gates.push(`Monthly limit of ${policy.maxAutoSubmissionsPerMonth} auto-submissions reached`);
  }
  // Safety rails (never configurable).
  if (!input.groundingPassed) gates.push("Some statements could not be verified");
  if (!input.allCitedFactsConfirmed) gates.push("Uses facts nobody has confirmed yet");
  if (!input.channelSupportsAuto) gates.push("This funder needs a person to submit");
  const withTwo = withTwoPerson(gates);

  if (withTwo.length === 0) {
    return {
      tier: "auto",
      reasons: [
        riskThresholds
          ? "Small ask, strong fit, every statement verified — all autopilot rules pass"
          : "Full autopilot: passes every safety rail, so it is submitted for you",
      ],
    };
  }
  return { tier: "one_click", reasons: withTwo };
}

export interface ExampleGrant {
  id: string;
  title: string;
  funder: string;
  input: RoutingInput;
}

/** Illustrative grants for the preview table (not real opportunities). */
export const EXAMPLE_GRANTS: ExampleGrant[] = [
  {
    id: "small",
    title: "Tool & equipment mini-grant",
    funder: "Regional community foundation (you've applied before)",
    input: {
      askCents: 750_000,
      fitScore: 88,
      likelihood: 0.45,
      firstSubmissionToFunder: false,
      autoSubmissionsThisMonth: 0,
      groundingPassed: true,
      openBlockers: 0,
      allCitedFactsConfirmed: true,
      channelSupportsAuto: true,
    },
  },
  {
    id: "medium",
    title: "Workforce training expansion",
    funder: "State workforce agency (first time applying)",
    input: {
      askCents: 6_000_000,
      fitScore: 82,
      likelihood: 0.55,
      firstSubmissionToFunder: true,
      autoSubmissionsThisMonth: 0,
      groundingPassed: true,
      openBlockers: 0,
      allCitedFactsConfirmed: true,
      channelSupportsAuto: true,
    },
  },
  {
    id: "large",
    title: "Registered apprenticeship program",
    funder: "Federal agency (first time applying)",
    input: {
      askCents: 45_000_000,
      fitScore: 76,
      likelihood: 0.3,
      firstSubmissionToFunder: true,
      autoSubmissionsThisMonth: 0,
      groundingPassed: true,
      openBlockers: 0,
      allCitedFactsConfirmed: true,
      channelSupportsAuto: true,
    },
  },
];

/** One row of GET /settings/automation-preview (the client fallback produces the same shape). */
export interface AutomationPreviewExample {
  label: string;
  amountCents: number;
  fitScore: number;
  likelihood: number;
  firstToFunder: boolean;
  tier: ReviewTier;
  reasons: string[];
}

export interface AutomationPreviewResponse {
  examples: AutomationPreviewExample[];
}

/** The example grants routed on the client with `policy` (same shape as the server preview). */
export function clientAutomationPreview(policy: RoutingPolicy): AutomationPreviewResponse {
  return {
    examples: EXAMPLE_GRANTS.map((g) => {
      const r = routeApplication(policy, g.input);
      return {
        label: g.title,
        amountCents: g.input.askCents,
        fitScore: g.input.fitScore,
        likelihood: g.input.likelihood,
        firstToFunder: g.input.firstSubmissionToFunder,
        tier: r.tier,
        reasons: r.reasons,
      };
    }),
  };
}

export const TIER_LABELS: Record<ReviewTier, string> = {
  auto: "Automatic",
  one_click: "One-click approval",
  full_review: "Full review",
};

export const TIER_DESCRIPTIONS: Record<ReviewTier, string> = {
  auto: "Small, well-matched grants where every statement is verified. Submitted for you, and you're notified.",
  one_click:
    "We prepare the full package with a one-page summary and anything that needs attention. A person approves with one click.",
  full_review:
    "Large grants, or ones you have a good chance of winning. A person on your team reads and edits every section before anything is sent.",
};
