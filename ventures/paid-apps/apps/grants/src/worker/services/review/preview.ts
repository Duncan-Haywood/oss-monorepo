// GET /settings/automation-preview: how four example grants would be routed under the org's
// current automation config (or a draft of it, via query overrides that are NOT saved). Uses the
// real policy (decideReviewTier) and the org's real consent, billing and monthly-cap state; the
// per-application rails (grounding, blockers, confirmed facts, verified email, deadline, edits,
// injection warnings) are assumed to hold, as stated in `assumptions`.
import type { ReviewTier } from "@shared/enums";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import { orgSettings, submissions } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { AUTODRAFT_MIN_FIT } from "../matching/autodraft";
import {
  AUTOMATION_LEVELS,
  type AutomationPreset,
  automationPresets,
  type EffectiveAutomation,
  resolveAutomation,
} from "./automation";
import { decideReviewTier } from "./policy";
import {
  autopilotConsentGranted,
  billingActive,
  SAFETY_RAIL_DESCRIPTIONS,
  SAFETY_RAILS,
  type SafetyRail,
} from "./safety-rails";

const triState = z
  .enum(["true", "false", "null"])
  .transform((v) => (v === "null" ? null : v === "true"))
  .optional();

/** Unsaved changes to preview (query string). Omitted = the saved value. */
export const AutomationPreviewQuery = z.object({
  automationLevel: z.enum(AUTOMATION_LEVELS).optional(),
  requireMatchApproval: triState,
  requireFactConfirmation: triState,
  requireDraftReview: triState,
  requireSubmissionApproval: triState,
  requireFollowupApproval: triState,
  twoPersonRuleAboveCents: z
    .union([z.literal("null"), z.coerce.number().int().min(0).max(1_000_000_000_000)])
    .transform((v) => (v === "null" ? null : v))
    .optional(),
});
export type AutomationPreviewOverrides = z.infer<typeof AutomationPreviewQuery>;

export type AutomationPreviewExampleKey = "small" | "medium" | "large" | "first_to_funder";

export interface AutomationPreviewExample {
  key: AutomationPreviewExampleKey;
  label: string;
  amountCents: number;
  fitScore: number;
  likelihood: number;
  firstToFunder: boolean;
  tier: ReviewTier;
  reasons: string[];
  /** Distinct reviewers who must approve before a human-approved submission (two-person rule). */
  requiredApprovals: 1 | 2;
  /** Whether autopilot would start the draft: on its own, only after a person shortlists, or never. */
  drafting: "auto" | "after_shortlist" | "manual";
}

export interface AutomationPreviewResponse {
  automation: EffectiveAutomation;
  presets: AutomationPreset[];
  safetyRails: { key: SafetyRail; description: string }[];
  assumptions: string[];
  examples: AutomationPreviewExample[];
}

const EXAMPLES: Omit<
  AutomationPreviewExample,
  "tier" | "reasons" | "requiredApprovals" | "drafting"
>[] = [
  {
    key: "small",
    label: "Small community grant",
    amountCents: 500_000,
    fitScore: 88,
    likelihood: 0.35,
    firstToFunder: false,
  },
  {
    key: "medium",
    label: "Mid-size foundation grant",
    amountCents: 5_000_000,
    fitScore: 85,
    likelihood: 0.4,
    firstToFunder: false,
  },
  {
    key: "large",
    label: "Large federal grant",
    amountCents: 25_000_000,
    fitScore: 90,
    likelihood: 0.45,
    firstToFunder: false,
  },
  {
    key: "first_to_funder",
    label: "Small grant from a new funder",
    amountCents: 500_000,
    fitScore: 88,
    likelihood: 0.35,
    firstToFunder: true,
  },
];

const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export async function automationPreview(
  ctx: AppContext,
  orgId: string,
  overrides: AutomationPreviewOverrides = {},
): Promise<AutomationPreviewResponse> {
  const saved = await ctx.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
  if (!saved) throw notFound("Organization settings");
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) as AutomationPreviewOverrides;
  const settings = { ...saved, ...defined };
  if (defined.automationLevel) {
    settings.autopilotEnabled = ["supervised", "full"].includes(defined.automationLevel);
  }
  const [consent, billing, used] = await Promise.all([
    autopilotConsentGranted(ctx, orgId),
    billingActive(ctx, orgId),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.orgId, orgId),
          eq(submissions.submittedByType, "autopilot"),
          ne(submissions.status, "failed"),
          gte(submissions.createdAt, startOfMonthUtc(ctx.now())),
        ),
      )
      .get(),
  ]);
  const autoSubmissionsThisMonth = Number(used?.n ?? 0);
  // Previewing a move into supervised/full: the consent is recorded when that change is saved.
  const consentForPreview = consent || defined.automationLevel !== undefined;

  const automation = resolveAutomation(settings);
  const examples = EXAMPLES.map((g): AutomationPreviewExample => {
    const d = decideReviewTier({
      settings,
      requestedAmountCents: g.amountCents,
      fitScore: g.fitScore,
      likelihood: g.likelihood,
      groundingPassed: true,
      openBlockers: 0,
      unconfirmedCitations: 0,
      isFirstSubmissionToFunder: g.firstToFunder,
      autoSubmissionsThisMonth,
      submissionChannelSupportsAuto: true,
      hasHumanEdits: false,
      recipientEmailVerified: true,
      autopilotConsentGranted: consentForPreview,
      deadlinePassed: false,
      billingActive: billing,
      injectionWarnings: 0,
    });
    const drafting =
      !d.automation.autoDraft || settings.autoDraftTopN <= 0 || g.fitScore < AUTODRAFT_MIN_FIT
        ? "manual"
        : d.automation.requireMatchApproval
          ? "after_shortlist"
          : "auto";
    return {
      ...g,
      tier: d.tier,
      reasons: d.reasons,
      requiredApprovals: d.requiredApprovals,
      drafting,
    };
  });
  const assumptions = [
    "Each example passed grounding, has no open flags, cites only confirmed facts, goes to a verified funder email, is before its deadline, has no human edits and no injection warnings.",
    `Uses your organization's real consent (${consent ? "granted" : "not granted"}), billing (${billing ? "active" : "not active"}) and ${autoSubmissionsThisMonth} automatic submission${autoSubmissionsThisMonth === 1 ? "" : "s"} this month.`,
  ];
  if (!consent && defined.automationLevel !== undefined) {
    assumptions.push("Assumes the autopilot consent you would record by saving this level.");
  }
  return {
    automation,
    presets: automationPresets(),
    safetyRails: SAFETY_RAILS.map((key) => ({ key, description: SAFETY_RAIL_DESCRIPTIONS[key] })),
    assumptions,
    examples,
  };
}
