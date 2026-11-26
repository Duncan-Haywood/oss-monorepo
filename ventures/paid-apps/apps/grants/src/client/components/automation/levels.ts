// Automation levels (org_settings.automationLevel): presets, per-stage overrides and the
// "what the AI will do for you" plan. Pure, so the settings page, onboarding and the dashboard
// describe each level the same way. Mirrors worker/services/review/automation.ts (presets,
// resolveAutomation) and safety-rails.ts; the server is authoritative.

export const AUTOMATION_LEVELS = ["manual", "assisted", "prepared", "supervised", "full"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const DEFAULT_AUTOMATION_LEVEL: AutomationLevel = "prepared";

export const isAutomationLevel = (v: unknown): v is AutomationLevel =>
  typeof v === "string" && (AUTOMATION_LEVELS as readonly string[]).includes(v);

export const levelRank = (level: AutomationLevel) => AUTOMATION_LEVELS.indexOf(level);

/** Levels where autopilot may submit without a person; turning one on needs recorded consent. */
export const levelSubmitsOnItsOwn = (level: AutomationLevel) =>
  level === "supervised" || level === "full";

/** Moving to `next` needs the autopilot consent dialog (raising into supervised/full). */
export const needsConsent = (from: AutomationLevel, to: AutomationLevel) =>
  levelSubmitsOnItsOwn(to) && levelRank(to) > levelRank(from);

/** Per-stage overrides that sit on top of a level's preset. */
export interface AutomationOverrides {
  requireMatchApproval: boolean;
  requireFactConfirmation: boolean;
  requireDraftReview: boolean;
  requireSubmissionApproval: boolean;
  requireFollowupApproval: boolean;
  /** Applications asking for more than this need two different people to approve; null = off. */
  twoPersonRuleAboveCents: number | null;
}

export interface AutomationSettings extends AutomationOverrides {
  automationLevel: AutomationLevel;
}

export const OVERRIDE_KEYS = [
  "requireMatchApproval",
  "requireFactConfirmation",
  "requireDraftReview",
  "requireSubmissionApproval",
  "requireFollowupApproval",
] as const satisfies readonly (keyof AutomationOverrides)[];
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];

export const LEVEL_PRESETS: Record<AutomationLevel, AutomationOverrides> = {
  manual: {
    requireMatchApproval: true,
    requireFactConfirmation: true,
    requireDraftReview: true,
    requireSubmissionApproval: true,
    requireFollowupApproval: true,
    twoPersonRuleAboveCents: null,
  },
  assisted: {
    requireMatchApproval: true,
    requireFactConfirmation: true,
    requireDraftReview: false,
    requireSubmissionApproval: true,
    requireFollowupApproval: true,
    twoPersonRuleAboveCents: null,
  },
  prepared: {
    requireMatchApproval: false,
    requireFactConfirmation: true,
    requireDraftReview: false,
    requireSubmissionApproval: true,
    requireFollowupApproval: true,
    twoPersonRuleAboveCents: null,
  },
  supervised: {
    requireMatchApproval: false,
    requireFactConfirmation: true,
    requireDraftReview: false,
    requireSubmissionApproval: false,
    requireFollowupApproval: true,
    twoPersonRuleAboveCents: null,
  },
  full: {
    requireMatchApproval: false,
    requireFactConfirmation: true,
    requireDraftReview: false,
    requireSubmissionApproval: false,
    requireFollowupApproval: false,
    twoPersonRuleAboveCents: null,
  },
};

/** Overrides a level forces on, whatever the org chose (shown as locked switches). */
export function lockedOverrides(level: AutomationLevel): Partial<Record<OverrideKey, string>> {
  return levelSubmitsOnItsOwn(level)
    ? {
        requireFactConfirmation: `Always on at ${LEVEL_META[level].label}: autopilot only ever uses facts a person has confirmed.`,
      }
    : {
        requireSubmissionApproval: `Always on at ${LEVEL_META[level].label}. Choose Supervised or Full autopilot to let small, safe applications go out on their own.`,
      };
}

/** Apply a level's locks (as the server's resolveAutomation does). */
export function enforceLocks<T extends AutomationSettings>(s: T): T {
  return levelSubmitsOnItsOwn(s.automationLevel)
    ? { ...s, requireFactConfirmation: true }
    : { ...s, requireSubmissionApproval: true };
}

/**
 * Checkpoints for PATCH /settings: null where the value equals the level's preset (so the org
 * follows the preset), the boolean where it's a deliberate override.
 */
export function checkpointPatch(s: AutomationSettings): Record<OverrideKey, boolean | null> {
  const preset = LEVEL_PRESETS[s.automationLevel];
  const out = {} as Record<OverrideKey, boolean | null>;
  for (const k of OVERRIDE_KEYS) out[k] = s[k] === preset[k] ? null : s[k];
  return out;
}

/** Settings as they may arrive from the API (fields absent until the server supports them). */
export interface AutomationSettingsSource {
  automationLevel?: string | null;
  requireMatchApproval?: boolean | null;
  requireFactConfirmation?: boolean | null;
  requireDraftReview?: boolean | null;
  requireSubmissionApproval?: boolean | null;
  requireFollowupApproval?: boolean | null;
  twoPersonRuleAboveCents?: number | null;
  autopilotEnabled?: boolean;
  autoDraftTopN?: number;
}

/**
 * The org's level + overrides (null override = the preset's value). Rows saved before levels
 * existed map like the server: autopilot on → supervised, otherwise prepared.
 */
export function readAutomation(s: AutomationSettingsSource | undefined): AutomationSettings {
  const level: AutomationLevel = isAutomationLevel(s?.automationLevel)
    ? s.automationLevel
    : s?.autopilotEnabled
      ? "supervised"
      : DEFAULT_AUTOMATION_LEVEL;
  const preset = LEVEL_PRESETS[level];
  const bool = (k: OverrideKey) => {
    const v = s?.[k];
    return typeof v === "boolean" ? v : preset[k];
  };
  return enforceLocks({
    automationLevel: level,
    requireMatchApproval: bool("requireMatchApproval"),
    requireFactConfirmation: bool("requireFactConfirmation"),
    requireDraftReview: bool("requireDraftReview"),
    requireSubmissionApproval: bool("requireSubmissionApproval"),
    requireFollowupApproval: bool("requireFollowupApproval"),
    twoPersonRuleAboveCents: s?.twoPersonRuleAboveCents ?? preset.twoPersonRuleAboveCents,
  });
}

/** Switch level: the new level's preset replaces the per-stage overrides (two-person rule kept). */
export function applyLevel(
  current: AutomationSettings,
  level: AutomationLevel,
): AutomationSettings {
  return enforceLocks({
    ...LEVEL_PRESETS[level],
    twoPersonRuleAboveCents: current.twoPersonRuleAboveCents,
    automationLevel: level,
  });
}

/** Overrides that differ from the level's preset (for the "Customized" hint). */
export function customizedOverrides(s: AutomationSettings): OverrideKey[] {
  const preset = LEVEL_PRESETS[s.automationLevel];
  return OVERRIDE_KEYS.filter((k) => s[k] !== preset[k]);
}

/** How many top matches to auto-draft when switching to `level` (0 = only when asked). */
export function autoDraftForLevel(level: AutomationLevel, current: number): number {
  if (level === "manual" || level === "assisted") return 0;
  return current > 0 ? current : 3;
}

export interface LevelMeta {
  label: string;
  /** One line for the segmented control / chip. */
  short: string;
  aiDoes: string;
  youDo: string;
  example: string;
  recommended?: boolean;
}

export const LEVEL_META: Record<AutomationLevel, LevelMeta> = {
  manual: {
    label: "Manual",
    short: "You start every draft",
    aiDoes: "Finds grants for you and scores how well each one fits.",
    youDo: "Start every draft yourself and give everything a full review.",
    example:
      "We flag a $25,000 foundation grant as a strong fit. You decide whether to apply, write it, and read every section before it goes.",
  },
  assisted: {
    label: "Assisted",
    short: "AI drafts when you ask",
    aiDoes: "Finds and scores grants, and writes a draft whenever you ask for one.",
    youDo: "Review every draft and approve every submission.",
    example:
      "You click “Start application” on a $25,000 grant. A draft built from your own documents is ready to read and edit in minutes.",
  },
  prepared: {
    label: "Prepared",
    short: "You approve every submission",
    aiDoes:
      "Drafts your best matches automatically and checks every sentence against your documents.",
    youDo: "Approve every submission, usually with one click.",
    example:
      "On Monday morning three drafts are waiting. You skim each one-page summary, fix one sentence, and approve.",
    recommended: true,
  },
  supervised: {
    label: "Supervised",
    short: "Small, low-risk ones go automatically",
    aiDoes: "Submits small, low-risk applications on its own, within your limits.",
    youDo:
      "Approve most applications with one click, and give large grants or likely wins a full review.",
    example:
      "A $5,000 equipment grant from a funder you know is sent for you. A $150,000 federal grant waits for your full review.",
  },
  full: {
    label: "Full autopilot",
    short: "Submits everything that passes the safety rails",
    aiDoes: "Submits every application that passes the safety rails, and emails you each time.",
    youDo: "Spot-check what was sent and handle anything the safety rails hold back.",
    example:
      "A $40,000 grant passes every check and goes out overnight. You get an email with the exact package that was sent.",
  },
};

// ---------- "What the AI will do for you" ----------

export const STAGES = ["find", "score", "draft", "check", "submit", "followup"] as const;
export type Stage = (typeof STAGES)[number];

/** automatic = happens without you · approve = AI does the work, you sign off · you = you do it. */
export type StageMode = "automatic" | "approve" | "you";

export const STAGE_LABELS: Record<Stage, string> = {
  find: "Find",
  score: "Score",
  draft: "Draft",
  check: "Check",
  submit: "Submit",
  followup: "Follow up",
};

export const STAGE_MODE_LABELS: Record<StageMode, string> = {
  automatic: "Automatic",
  approve: "You approve",
  you: "You do it",
};

export interface StageStep {
  stage: Stage;
  label: string;
  mode: StageMode;
  detail: string;
}

export interface PlanContext {
  autoDraftTopN: number;
  autoSubmitMaxCents: number;
  formatMoney: (cents: number) => string;
}

/** Who does each pipeline step at these settings. */
export function stagePlan(s: AutomationSettings, ctx: PlanContext): StageStep[] {
  const level = s.automationLevel;
  const step = (stage: Stage, mode: StageMode, detail: string): StageStep => ({
    stage,
    label: STAGE_LABELS[stage],
    mode,
    detail,
  });

  const draft =
    level === "manual"
      ? step("draft", "you", "You start every draft. The AI suggests wording only when you ask.")
      : level === "assisted" || ctx.autoDraftTopN === 0
        ? step("draft", "approve", "The AI writes a draft whenever you ask for one.")
        : s.requireMatchApproval
          ? step(
              "draft",
              "approve",
              `You approve a match, then the AI drafts it. Up to ${ctx.autoDraftTopN} a day.`,
            )
          : step(
              "draft",
              "automatic",
              `The AI drafts your top ${ctx.autoDraftTopN} match${ctx.autoDraftTopN === 1 ? "" : "es"} each day.`,
            );

  const check =
    level === "manual"
      ? step(
          "check",
          "you",
          "Every sentence is checked against your documents, and you read every section.",
        )
      : s.requireDraftReview
        ? step(
            "check",
            "approve",
            "Every sentence is checked against your documents, then you review the whole draft.",
          )
        : s.requireFactConfirmation
          ? step(
              "check",
              "approve",
              "Every sentence is checked against your documents. You confirm each new fact once.",
            )
          : step("check", "automatic", "Every sentence is checked against your documents.");

  const twoPerson =
    s.twoPersonRuleAboveCents != null
      ? ` Asks over ${ctx.formatMoney(s.twoPersonRuleAboveCents)} need two people to approve.`
      : "";
  const submit = s.requireSubmissionApproval
    ? step(
        "submit",
        "approve",
        level === "manual" || level === "assisted" || s.requireDraftReview
          ? `You approve every submission after reviewing it.${twoPerson}`
          : `You approve every submission: one click for most, a full read for large grants.${twoPerson}`,
      )
    : level === "full"
      ? step(
          "submit",
          "automatic",
          `Everything that passes the safety rails is sent for you, and you're emailed each time.${twoPerson}`,
        )
      : level === "supervised"
        ? step(
            "submit",
            "approve",
            `Small, low-risk asks up to ${ctx.formatMoney(ctx.autoSubmitMaxCents)} go out automatically. You approve the rest.${twoPerson}`,
          )
        : step("submit", "approve", `You approve every submission.${twoPerson}`);

  const followup =
    level === "manual"
      ? step(
          "followup",
          "you",
          "We remind you about reports and thank-yous. You write and send them.",
        )
      : s.requireFollowupApproval
        ? step(
            "followup",
            "approve",
            "The AI drafts thank-yous, reports and replies. You approve before anything is sent.",
          )
        : step(
            "followup",
            "automatic",
            "Thank-yous and routine replies are sent for you. Reports still come to you.",
          );

  return [
    step("find", "automatic", "We search federal, state and foundation grants for you every day."),
    step(
      "score",
      "automatic",
      "Each grant is scored for fit and eligibility, with the reasons shown.",
    ),
    draft,
    check,
    submit,
    followup,
  ];
}

// ---------- safety rails ----------

/** Never configurable: every automatic submission must pass all of these, at every level. */
export const SAFETY_RAILS: readonly { key: string; label: string; help: string }[] = [
  {
    key: "grounding",
    label: "Grounding check passed",
    help: "Every statement is traced back to your own documents.",
  },
  {
    key: "blockers",
    label: "No open blockers",
    help: "Anything flagged as blocking must be resolved by a person.",
  },
  {
    key: "confirmed_facts",
    label: "Only confirmed facts",
    help: "Autopilot never sends a fact nobody on your team has confirmed.",
  },
  {
    key: "recipient",
    label: "Verified recipient email",
    help: "We only send to a funder address we have verified.",
  },
  {
    key: "consent",
    label: "Autopilot consent on file",
    help: "An admin must have agreed, on your organization's behalf, to automatic submissions.",
  },
  {
    key: "deadline",
    label: "Deadline not passed",
    help: "Nothing is sent after the funder's deadline.",
  },
  {
    key: "human_edits",
    label: "Human edits need approval",
    help: "If a person changed a draft, a person approves it before it goes.",
  },
  {
    key: "billing",
    label: "Billing active",
    help: "Automatic submissions pause if your plan lapses.",
  },
  {
    key: "injection",
    label: "No injection warnings on sources",
    help: "Funder pages or documents with suspicious instructions stop autopilot.",
  },
];
