// Automation levels (pure): how much the system does on its own between "AI only finds grants" and
// "AI submits anything that passes the safety rails". A preset (`automationLevel`) sets defaults for
// the per-stage human checkpoints; each checkpoint can be overridden per org (null = preset default).
// The safety rails (safety-rails.ts) are NOT part of this config: no level or override relaxes them.
// Used by the review policy (policy.ts), auto-drafting (matching/autodraft.ts), review decisions
// (pipeline), the send-time re-check (submission) and the settings preview. No I/O here.
import type { orgSettings } from "../../db/schema";

type OrgSettingsRow = typeof orgSettings.$inferSelect;

export type AutomationLevel = NonNullable<OrgSettingsRow["automationLevel"]>;

/** Least to most automated. Order matters (`atLeast`). */
export const AUTOMATION_LEVELS = [
  "manual",
  "assisted",
  "prepared",
  "supervised",
  "full",
] as const satisfies readonly AutomationLevel[];

/** The recommended default for new orgs (and legacy rows with autopilot off). */
export const DEFAULT_AUTOMATION_LEVEL: AutomationLevel = "prepared";

export const CHECKPOINT_KEYS = [
  "requireMatchApproval",
  "requireFactConfirmation",
  "requireDraftReview",
  "requireSubmissionApproval",
  "requireFollowupApproval",
] as const;
export type CheckpointKey = (typeof CHECKPOINT_KEYS)[number];

/** Levels at which autopilot may submit (and that therefore need the autopilot_submission consent). */
export const AUTO_SUBMIT_LEVELS: readonly AutomationLevel[] = ["supervised", "full"];

export const isAutoSubmitLevel = (level: AutomationLevel) => AUTO_SUBMIT_LEVELS.includes(level);

export const atLeast = (level: AutomationLevel, min: AutomationLevel) =>
  AUTOMATION_LEVELS.indexOf(level) >= AUTOMATION_LEVELS.indexOf(min);

export interface AutomationPreset {
  level: AutomationLevel;
  label: string;
  description: string;
  /** AI starts drafts for the top matches after discovery (autoDraftTopN). */
  autoDraft: boolean;
  /** Autopilot may submit without a person (still subject to every gate and safety rail). */
  autoSubmit: boolean;
  /**
   * supervised: auto-submit only low-risk applications (ask, fit, likelihood thresholds).
   * full: amount, likelihood and fit thresholds do not apply (safety rails and the monthly cap do).
   */
  riskThresholds: boolean;
  checkpoints: Record<CheckpointKey, boolean>;
  /** Default two-person threshold (null = off) for the level. */
  twoPersonRuleAboveCents: number | null;
}

const PRESETS: Record<AutomationLevel, AutomationPreset> = {
  manual: {
    level: "manual",
    label: "Manual",
    description:
      "AI finds and scores grants only. People start every draft, every application gets a full review and nothing is submitted automatically.",
    autoDraft: false,
    autoSubmit: false,
    riskThresholds: true,
    checkpoints: {
      requireMatchApproval: true,
      requireFactConfirmation: true,
      requireDraftReview: true,
      requireSubmissionApproval: true,
      requireFollowupApproval: true,
    },
    twoPersonRuleAboveCents: null,
  },
  assisted: {
    level: "assisted",
    label: "Assisted",
    description:
      "AI drafts when a person asks. Every draft gets a one-click or full review; nothing is drafted or submitted automatically.",
    autoDraft: false,
    autoSubmit: false,
    riskThresholds: true,
    checkpoints: {
      requireMatchApproval: true,
      requireFactConfirmation: true,
      requireDraftReview: false,
      requireSubmissionApproval: true,
      requireFollowupApproval: true,
    },
    twoPersonRuleAboveCents: null,
  },
  prepared: {
    level: "prepared",
    label: "Prepared (recommended)",
    description:
      "AI drafts the top matches after each discovery run. People approve every submission: one click, or a full review above your thresholds.",
    autoDraft: true,
    autoSubmit: false,
    riskThresholds: true,
    checkpoints: {
      requireMatchApproval: false,
      requireFactConfirmation: true,
      requireDraftReview: false,
      requireSubmissionApproval: true,
      requireFollowupApproval: true,
    },
    twoPersonRuleAboveCents: null,
  },
  supervised: {
    level: "supervised",
    label: "Supervised autopilot",
    description:
      "Autopilot submits low-risk applications (small ask, good fit, not high-likelihood, not a first submission to the funder, within the monthly cap). One click for the middle, full review for high value or high likelihood.",
    autoDraft: true,
    autoSubmit: true,
    riskThresholds: true,
    checkpoints: {
      requireMatchApproval: false,
      requireFactConfirmation: true,
      requireDraftReview: false,
      requireSubmissionApproval: false,
      requireFollowupApproval: true,
    },
    twoPersonRuleAboveCents: null,
  },
  full: {
    level: "full",
    label: "Full autopilot",
    description:
      "Autopilot submits anything that passes the safety rails, whatever the amount or likelihood, within the monthly cap.",
    autoDraft: true,
    autoSubmit: true,
    riskThresholds: false,
    checkpoints: {
      requireMatchApproval: false,
      requireFactConfirmation: true,
      requireDraftReview: false,
      requireSubmissionApproval: false,
      requireFollowupApproval: false,
    },
    twoPersonRuleAboveCents: null,
  },
};

export function presetDefaults(level: AutomationLevel): AutomationPreset {
  return PRESETS[level];
}

export const automationPresets = (): AutomationPreset[] => AUTOMATION_LEVELS.map(presetDefaults);

/**
 * The org_settings columns automation reads. Everything except autopilotEnabled is optional, and
 * the level may be any string (unknown values fall back to the legacy derivation).
 */
export type AutomationSettings = Pick<OrgSettingsRow, "autopilotEnabled"> &
  Partial<Pick<OrgSettingsRow, CheckpointKey | "twoPersonRuleAboveCents" | "autoDraftTopN">> & {
    automationLevel?: string | null;
  };

export const isAutomationLevel = (v: unknown): v is AutomationLevel =>
  typeof v === "string" && (AUTOMATION_LEVELS as readonly string[]).includes(v);

export interface EffectiveAutomation {
  level: AutomationLevel;
  /** "explicit": automationLevel is set; "legacy": derived from autopilotEnabled. */
  source: "explicit" | "legacy";
  autoDraft: boolean;
  /** Autopilot may submit at all (level allows it AND submission approval is not required). */
  autoSubmit: boolean;
  riskThresholds: boolean;
  requireMatchApproval: boolean;
  requireFactConfirmation: boolean;
  requireDraftReview: boolean;
  requireSubmissionApproval: boolean;
  requireFollowupApproval: boolean;
  twoPersonRuleAboveCents: number | null;
  /** Checkpoints whose stored override differs from the preset (shown in the UI). */
  overridden: CheckpointKey[];
  /** Overrides ignored because the level forbids them (e.g. fact confirmation off at full). */
  forced: CheckpointKey[];
}

/** Level from the row: explicit, else legacy autopilotEnabled (true → supervised, false → prepared). */
export function automationLevelOf(s: AutomationSettings): {
  level: AutomationLevel;
  source: "explicit" | "legacy";
} {
  if (isAutomationLevel(s.automationLevel)) return { level: s.automationLevel, source: "explicit" };
  return { level: s.autopilotEnabled ? "supervised" : DEFAULT_AUTOMATION_LEVEL, source: "legacy" };
}

/** Preset + per-stage overrides → the config every automated step obeys. */
export function resolveAutomation(s: AutomationSettings): EffectiveAutomation {
  const { level, source } = automationLevelOf(s);
  const preset = presetDefaults(level);
  const overridden: CheckpointKey[] = [];
  const forced: CheckpointKey[] = [];
  const pick = (key: CheckpointKey): boolean => {
    const stored = s[key];
    if (stored === null || stored === undefined) return preset.checkpoints[key];
    if (stored !== preset.checkpoints[key]) overridden.push(key);
    return stored;
  };
  const requireMatchApproval = pick("requireMatchApproval");
  let requireFactConfirmation = pick("requireFactConfirmation");
  const requireDraftReview = pick("requireDraftReview");
  let requireSubmissionApproval = pick("requireSubmissionApproval");
  const requireFollowupApproval = pick("requireFollowupApproval");
  if (preset.autoSubmit && !requireFactConfirmation) {
    // Only confirmed facts may ever be cited in an auto-submitted application.
    requireFactConfirmation = true;
    forced.push("requireFactConfirmation");
    const i = overridden.indexOf("requireFactConfirmation");
    if (i >= 0) overridden.splice(i, 1);
  }
  if (!preset.autoSubmit && !requireSubmissionApproval) {
    // Levels below supervised never auto-submit: switching submission approval off needs a level.
    requireSubmissionApproval = true;
    forced.push("requireSubmissionApproval");
    const i = overridden.indexOf("requireSubmissionApproval");
    if (i >= 0) overridden.splice(i, 1);
  }
  return {
    level,
    source,
    autoDraft: preset.autoDraft,
    autoSubmit: preset.autoSubmit && !requireSubmissionApproval,
    riskThresholds: preset.riskThresholds,
    requireMatchApproval,
    requireFactConfirmation,
    requireDraftReview,
    requireSubmissionApproval,
    requireFollowupApproval,
    twoPersonRuleAboveCents: s.twoPersonRuleAboveCents ?? preset.twoPersonRuleAboveCents,
    overridden,
    forced,
  };
}

/** Distinct approving reviewers needed before a human-approved submission goes out (1 or 2). */
export function requiredApprovals(
  config: Pick<EffectiveAutomation, "twoPersonRuleAboveCents">,
  requestedAmountCents: number | null,
): 1 | 2 {
  if (config.twoPersonRuleAboveCents === null) return 1;
  // Unknown ask fails closed: two reviewers.
  if (requestedAmountCents === null) return 2;
  return requestedAmountCents > config.twoPersonRuleAboveCents ? 2 : 1;
}

/**
 * Whether a follow-up email to a FUNDER may be sent without a person approving it. Note: the
 * submission module sends no funder follow-ups today (follow-ups are reminders to the org's own
 * team), so nothing calls this yet; any future funder-facing follow-up sender must.
 */
export function canAutoSendFunderFollowup(
  config: Pick<EffectiveAutomation, "autoSubmit" | "requireFollowupApproval">,
): boolean {
  return config.autoSubmit && !config.requireFollowupApproval;
}

/** Compact form for audit metadata ("the level in effect"). */
export function automationAuditMeta(config: EffectiveAutomation) {
  return {
    automationLevel: config.level,
    automationSource: config.source,
    ...(config.overridden.length ? { automationOverrides: config.overridden } : {}),
  };
}
