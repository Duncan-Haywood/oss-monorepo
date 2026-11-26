import { describe, expect, it } from "vitest";
import { decideReviewTier, type ReviewPolicyInput, type ReviewPolicySettings } from "./policy";

const settings: ReviewPolicySettings = {
  autopilotEnabled: true,
  autoSubmitMaxCents: 1_000_000, // $10k
  fullReviewAboveCents: 10_000_000, // $100k
  minFitScoreForAuto: 80,
  highLikelihoodThreshold: 0.6,
  reviewFirstSubmissionPerFunder: true,
  maxAutoSubmissionsPerMonth: 5,
};

/** Passes every autopilot gate. */
const autoInput: ReviewPolicyInput = {
  settings,
  requestedAmountCents: 500_000,
  fitScore: 90,
  likelihood: 0.3,
  groundingPassed: true,
  openBlockers: 0,
  unconfirmedCitations: 0,
  isFirstSubmissionToFunder: false,
  autoSubmissionsThisMonth: 0,
  submissionChannelSupportsAuto: true,
  hasHumanEdits: false,
  recipientEmailVerified: true,
  autopilotConsentGranted: true,
  deadlinePassed: false,
  billingActive: true,
  injectionWarnings: 0,
};

type Case = {
  name: string;
  patch: Partial<Omit<ReviewPolicyInput, "settings">>;
  settings?: Partial<ReviewPolicySettings>;
  tier: "auto" | "one_click" | "full_review";
  reason?: RegExp;
};

const cases: Case[] = [
  { name: "all gates pass", patch: {}, tier: "auto", reason: /All autopilot gates passed/ },
  { name: "ask exactly at auto limit", patch: { requestedAmountCents: 1_000_000 }, tier: "auto" },
  { name: "fit exactly at minimum", patch: { fitScore: 80 }, tier: "auto" },
  {
    name: "first submission allowed when not configured",
    patch: { isFirstSubmissionToFunder: true },
    settings: { reviewFirstSubmissionPerFunder: false },
    tier: "auto",
  },
  {
    name: "autopilot disabled",
    patch: {},
    settings: { autopilotEnabled: false },
    tier: "one_click",
    reason: /Autopilot is turned off/,
  },
  {
    name: "ask above auto limit",
    patch: { requestedAmountCents: 1_000_001 },
    tier: "one_click",
    reason: /exceeds the autopilot limit of \$10,000/,
  },
  {
    name: "unknown ask",
    patch: { requestedAmountCents: null },
    tier: "one_click",
    reason: /amount is unknown/,
  },
  { name: "fit below minimum", patch: { fitScore: 79 }, tier: "one_click", reason: /Fit score 79/ },
  {
    name: "unknown fit",
    patch: { fitScore: null },
    tier: "one_click",
    reason: /Fit score is unknown/,
  },
  {
    name: "unknown likelihood",
    patch: { likelihood: null },
    tier: "one_click",
    reason: /Likelihood of award is unknown/,
  },
  {
    name: "first submission to funder",
    patch: { isFirstSubmissionToFunder: true },
    tier: "one_click",
    reason: /First submission/,
  },
  {
    name: "monthly cap reached",
    patch: { autoSubmissionsThisMonth: 5 },
    tier: "one_click",
    reason: /Monthly autopilot cap reached \(5\/5\)/,
  },
  {
    name: "grounding failed",
    patch: { groundingPassed: false },
    tier: "one_click",
    reason: /Grounding verification did not pass/,
  },
  {
    name: "unconfirmed citations",
    patch: { unconfirmedCitations: 2 },
    tier: "one_click",
    reason: /2 claims cite unconfirmed facts/,
  },
  {
    name: "channel cannot auto-submit",
    patch: { submissionChannelSupportsAuto: false },
    tier: "one_click",
    reason: /cannot be submitted automatically/,
  },
  {
    name: "human-edited draft never auto-submits",
    patch: { hasHumanEdits: true },
    tier: "one_click",
    reason: /A person edited this draft, so a human must approve it/,
  },
  {
    name: "human edits stay at most one_click even with every other gate passing",
    patch: { hasHumanEdits: true, requestedAmountCents: 1_000_000, fitScore: 100 },
    settings: { reviewFirstSubmissionPerFunder: false },
    tier: "one_click",
  },
  {
    name: "human edits do not downgrade full review",
    patch: { hasHumanEdits: true, openBlockers: 1 },
    tier: "full_review",
    reason: /1 blocking flag must be resolved/,
  },
  {
    name: "ask above full-review threshold",
    patch: { requestedAmountCents: 25_000_000 },
    tier: "full_review",
    reason: /\$250,000 is above the full-review threshold of \$100,000/,
  },
  {
    name: "ask exactly at full-review threshold is not full review",
    patch: { requestedAmountCents: 10_000_000 },
    tier: "one_click",
  },
  {
    name: "high likelihood",
    patch: { likelihood: 0.6 },
    tier: "full_review",
    reason: /High likelihood of award \(60% ≥ 60%\)/,
  },
  {
    name: "open blockers",
    patch: { openBlockers: 1 },
    tier: "full_review",
    reason: /1 blocking flag must be resolved/,
  },
  {
    name: "blockers win even with autopilot off",
    patch: { openBlockers: 3 },
    settings: { autopilotEnabled: false },
    tier: "full_review",
    reason: /3 blocking flags/,
  },
  {
    name: "full review wins over a misconfigured auto limit",
    patch: { requestedAmountCents: 20_000_000 },
    settings: { autoSubmitMaxCents: 50_000_000 },
    tier: "full_review",
  },
];

describe("decideReviewTier", () => {
  it.each(cases)("$name → $tier", ({ patch, settings: s, tier, reason }) => {
    const result = decideReviewTier({
      ...autoInput,
      ...patch,
      settings: { ...settings, ...s },
    });
    expect(result.tier).toBe(tier);
    expect(result.reasons.length).toBeGreaterThan(0);
    if (reason) expect(result.reasons.join("\n")).toMatch(reason);
  });

  it("lists every failed gate for one_click", () => {
    const result = decideReviewTier({
      ...autoInput,
      settings: { ...settings, autopilotEnabled: false },
      fitScore: 50,
      groundingPassed: false,
    });
    expect(result.tier).toBe("one_click");
    expect(result.reasons).toHaveLength(3);
  });

  it("lists every full-review trigger", () => {
    const result = decideReviewTier({
      ...autoInput,
      requestedAmountCents: 50_000_000,
      likelihood: 0.9,
      openBlockers: 2,
    });
    expect(result.tier).toBe("full_review");
    expect(result.reasons).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------
// Automation levels × per-stage overrides
// ---------------------------------------------------------------------------------------------

type Level = "manual" | "assisted" | "prepared" | "supervised" | "full";
type Grant = "small" | "medium" | "large" | "likely" | "first";

/** Example grants under the default thresholds ($10k auto limit, $100k full review, 0.6 likely). */
const grants: Record<Grant, Partial<ReviewPolicyInput>> = {
  small: { requestedAmountCents: 500_000 },
  medium: { requestedAmountCents: 5_000_000 },
  large: { requestedAmountCents: 25_000_000 },
  likely: { likelihood: 0.75 },
  first: { isFirstSubmissionToFunder: true },
};

const tierAt = (
  level: Level | null,
  grant: Grant,
  overrides: Partial<ReviewPolicySettings> = {},
  patch: Partial<ReviewPolicyInput> = {},
) =>
  decideReviewTier({
    ...autoInput,
    ...grants[grant],
    ...patch,
    settings: {
      ...settings,
      autopilotEnabled: level === "supervised" || level === "full",
      automationLevel: level,
      ...overrides,
    },
  });

describe("decideReviewTier × automation level", () => {
  const table: [Level, Record<Grant, "auto" | "one_click" | "full_review">][] = [
    [
      "manual",
      {
        small: "full_review",
        medium: "full_review",
        large: "full_review",
        likely: "full_review",
        first: "full_review",
      },
    ],
    [
      "assisted",
      {
        small: "one_click",
        medium: "one_click",
        large: "full_review",
        likely: "full_review",
        first: "one_click",
      },
    ],
    [
      "prepared",
      {
        small: "one_click",
        medium: "one_click",
        large: "full_review",
        likely: "full_review",
        first: "one_click",
      },
    ],
    [
      "supervised",
      {
        small: "auto",
        medium: "one_click",
        large: "full_review",
        likely: "full_review",
        first: "one_click",
      },
    ],
    // full: amount and likelihood no longer matter; first-to-funder still does while it is set.
    ["full", { small: "auto", medium: "auto", large: "auto", likely: "auto", first: "one_click" }],
  ];
  for (const [level, expected] of table) {
    it.each(Object.entries(expected))(`${level}: %s → %s`, (grant, tier) => {
      expect(tierAt(level, grant as Grant).tier).toBe(tier);
    });
  }

  it("explains why levels below supervised never auto-submit", () => {
    for (const level of ["manual", "assisted", "prepared"] as const) {
      const r = tierAt(level, "small");
      expect(r.tier).not.toBe("auto");
      expect(r.automation.level).toBe(level);
      expect(r.automation.autoSubmit).toBe(false);
    }
    expect(tierAt("prepared", "small").reasons.join("\n")).toMatch(
      /Autopilot is turned off .*Prepared/,
    );
    expect(tierAt("manual", "small").reasons.join("\n")).toMatch(/Draft review is required/);
  });

  it("full still respects the monthly cap, blockers and first-to-funder when set", () => {
    expect(tierAt("full", "large", {}, { autoSubmissionsThisMonth: 5 }).tier).toBe("one_click");
    expect(tierAt("full", "large", {}, { openBlockers: 1 }).tier).toBe("full_review");
    expect(tierAt("full", "first", { reviewFirstSubmissionPerFunder: false }).tier).toBe("auto");
    // Unknown ask / fit / likelihood do not matter at full (only the rails and the cap do).
    expect(
      tierAt("full", "small", {}, { requestedAmountCents: null, fitScore: null, likelihood: null })
        .tier,
    ).toBe("auto");
    expect(tierAt("full", "large").reasons[0]).toMatch(/Full autopilot: every safety rail passed/);
  });

  describe("per-stage overrides", () => {
    const cases: {
      name: string;
      level: Level;
      overrides: Partial<ReviewPolicySettings>;
      grant: Grant;
      tier: "auto" | "one_click" | "full_review";
      reason?: RegExp;
    }[] = [
      {
        name: "requireSubmissionApproval on supervised keeps a person in the loop",
        level: "supervised",
        overrides: { requireSubmissionApproval: true },
        grant: "small",
        tier: "one_click",
        reason: /Submission approval is required/,
      },
      {
        name: "requireSubmissionApproval on full",
        level: "full",
        overrides: { requireSubmissionApproval: true },
        grant: "large",
        tier: "one_click",
      },
      {
        name: "requireSubmissionApproval=false cannot make prepared auto-submit",
        level: "prepared",
        overrides: { requireSubmissionApproval: false },
        grant: "small",
        tier: "one_click",
        reason: /Autopilot is turned off/,
      },
      {
        name: "requireDraftReview on supervised forces full review",
        level: "supervised",
        overrides: { requireDraftReview: true },
        grant: "small",
        tier: "full_review",
        reason: /Draft review is required/,
      },
      {
        name: "requireDraftReview off on manual allows one-click",
        level: "manual",
        overrides: { requireDraftReview: false },
        grant: "small",
        tier: "one_click",
      },
      {
        name: "requireDraftReview on full forces full review",
        level: "full",
        overrides: { requireDraftReview: true },
        grant: "small",
        tier: "full_review",
      },
      {
        name: "requireFactConfirmation=false is ignored at full (unconfirmed citations still block)",
        level: "full",
        overrides: { requireFactConfirmation: false },
        grant: "small",
        tier: "auto",
      },
      {
        name: "two-person rule above the ask blocks auto at supervised",
        level: "supervised",
        overrides: { twoPersonRuleAboveCents: 100_000 },
        grant: "small",
        tier: "one_click",
        reason: /Two different reviewers must approve: the ask \$5,000 is above .* \$1,000/,
      },
      {
        name: "two-person rule blocks auto at full",
        level: "full",
        overrides: { twoPersonRuleAboveCents: 1_000_000 },
        grant: "large",
        tier: "one_click",
        reason: /Two different reviewers/,
      },
      {
        name: "two-person rule below the threshold does not apply",
        level: "supervised",
        overrides: { twoPersonRuleAboveCents: 1_000_000 },
        grant: "small",
        tier: "auto",
      },
      {
        name: "two-person rule is listed on full review",
        level: "prepared",
        overrides: { twoPersonRuleAboveCents: 1_000_000 },
        grant: "large",
        tier: "full_review",
        reason: /Two different reviewers/,
      },
      {
        name: "requireMatchApproval and requireFollowupApproval do not change routing",
        level: "supervised",
        overrides: { requireMatchApproval: true, requireFollowupApproval: false },
        grant: "small",
        tier: "auto",
      },
    ];
    it.each(cases)("$name", ({ level, overrides, grant, tier, reason }) => {
      const r = tierAt(level, grant, overrides);
      expect(r.tier).toBe(tier);
      if (reason) expect(r.reasons.join("\n")).toMatch(reason);
    });

    it("reports two required approvals (unknown ask fails closed)", () => {
      expect(
        tierAt("prepared", "large", { twoPersonRuleAboveCents: 1_000_000 }).requiredApprovals,
      ).toBe(2);
      expect(
        tierAt("prepared", "small", { twoPersonRuleAboveCents: 1_000_000 }).requiredApprovals,
      ).toBe(1);
      expect(
        tierAt(
          "prepared",
          "small",
          { twoPersonRuleAboveCents: 1_000_000 },
          { requestedAmountCents: null },
        ).requiredApprovals,
      ).toBe(2);
      expect(tierAt("prepared", "large").requiredApprovals).toBe(1);
    });
  });
});

describe("backward compatibility (no automation level)", () => {
  it("autopilotEnabled=true routes exactly like supervised", () => {
    for (const grant of Object.keys(grants) as Grant[]) {
      const legacy = tierAt(null, grant, { autopilotEnabled: true });
      const supervised = tierAt("supervised", grant);
      expect(legacy.tier, grant).toBe(supervised.tier);
      expect(legacy.reasons).toEqual(supervised.reasons);
      expect(legacy.automation).toMatchObject({ level: "supervised", source: "legacy" });
    }
  });

  it("autopilotEnabled=false routes exactly like prepared", () => {
    for (const grant of Object.keys(grants) as Grant[]) {
      const legacy = tierAt(null, grant, { autopilotEnabled: false });
      expect(legacy.tier, grant).toBe(tierAt("prepared", grant).tier);
      expect(legacy.automation).toMatchObject({ level: "prepared", source: "legacy" });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// SAFETY RAILS cannot be bypassed, not even under `full` with every override relaxed
// ---------------------------------------------------------------------------------------------

describe("safety rails under full autopilot", () => {
  const permissive: Partial<ReviewPolicySettings> = {
    automationLevel: "full",
    autopilotEnabled: true,
    requireFactConfirmation: false,
    requireSubmissionApproval: false,
    requireDraftReview: false,
    requireMatchApproval: false,
    requireFollowupApproval: false,
    twoPersonRuleAboveCents: null,
    reviewFirstSubmissionPerFunder: false,
    maxAutoSubmissionsPerMonth: 100,
  };
  const run = (patch: Partial<ReviewPolicyInput>) =>
    decideReviewTier({ ...autoInput, ...patch, settings: { ...settings, ...permissive } });

  it("auto-submits when every rail holds (baseline)", () => {
    expect(run({}).tier).toBe("auto");
  });

  const rails: [string, Partial<ReviewPolicyInput>, RegExp][] = [
    ["grounding not passed", { groundingPassed: false }, /Grounding verification did not pass/],
    ["an open blocker", { openBlockers: 1 }, /blocking flag/],
    ["citations of unconfirmed facts", { unconfirmedCitations: 1 }, /cites unconfirmed facts/],
    [
      "unverified recipient email",
      { recipientEmailVerified: false },
      /email address is not verified/,
    ],
    [
      "no autopilot_submission consent",
      { autopilotConsentGranted: false },
      /autopilot submission consent/,
    ],
    ["deadline already passed", { deadlinePassed: true }, /deadline has passed/],
    ["human edits since the last approval", { hasHumanEdits: true }, /A person edited this draft/],
    ["billing not active", { billingActive: false }, /billing is not active/],
    [
      "injection warnings on source documents",
      { injectionWarnings: 2 },
      /prompt-injection warning/,
    ],
  ];
  it.each(rails)("never auto-submits with %s", (_name, patch, reason) => {
    const r = run(patch);
    expect(r.tier).not.toBe("auto");
    expect(r.reasons.join("\n")).toMatch(reason);
  });

  it.each([
    ["consent", { autopilotConsentGranted: undefined }],
    ["deadline", { deadlinePassed: undefined }],
    ["billing", { billingActive: undefined }],
    ["injection warnings", { injectionWarnings: undefined }],
    ["recipient", { recipientEmailVerified: undefined }],
  ] as const)("an unknown %s fails closed", (_name, patch) => {
    expect(run(patch).tier).not.toBe("auto");
  });
});
