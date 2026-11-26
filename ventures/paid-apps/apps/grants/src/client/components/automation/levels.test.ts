import { type RoutingPolicy, routeApplication } from "@client/routes/org/settings/routing-preview";
import { presetDefaults, resolveAutomation } from "@worker/services/review/automation";
import { decideReviewTier } from "@worker/services/review/policy";
import { SAFETY_RAILS as SERVER_RAILS } from "@worker/services/review/safety-rails";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_LEVELS,
  type AutomationLevel,
  applyLevel,
  checkpointPatch,
  customizedOverrides,
  LEVEL_PRESETS,
  needsConsent,
  OVERRIDE_KEYS,
  readAutomation,
  SAFETY_RAILS,
  stagePlan,
} from "./levels";

const ctx = {
  autoDraftTopN: 3,
  autoSubmitMaxCents: 1_000_000,
  formatMoney: (c: number) => `$${c / 100}`,
};
const modes = (level: AutomationLevel) =>
  Object.fromEntries(
    stagePlan(readAutomation({ automationLevel: level }), ctx).map((s) => [s.stage, s.mode]),
  );

describe("automation levels", () => {
  it("mirrors the server presets for every level", () => {
    for (const level of AUTOMATION_LEVELS) {
      const server = presetDefaults(level);
      for (const k of OVERRIDE_KEYS)
        expect(LEVEL_PRESETS[level][k], `${level}.${k}`).toBe(server.checkpoints[k]);
      expect(LEVEL_PRESETS[level].twoPersonRuleAboveCents).toBe(server.twoPersonRuleAboveCents);
    }
  });

  it("maps legacy rows like the server (autopilot on → supervised, else prepared)", () => {
    expect(readAutomation({ autopilotEnabled: true }).automationLevel).toBe("supervised");
    expect(readAutomation({ autopilotEnabled: false, autoDraftTopN: 0 }).automationLevel).toBe(
      "prepared",
    );
    expect(readAutomation(undefined).automationLevel).toBe("prepared");
  });

  it("forces the same checkpoints the server forces", () => {
    for (const level of AUTOMATION_LEVELS) {
      const stored = {
        automationLevel: level,
        requireFactConfirmation: false,
        requireSubmissionApproval: false,
      };
      const client = readAutomation(stored);
      const server = resolveAutomation({ autopilotEnabled: false, ...stored });
      expect(client.requireFactConfirmation, level).toBe(server.requireFactConfirmation);
      expect(client.requireSubmissionApproval, level).toBe(server.requireSubmissionApproval);
    }
  });

  it("changes the timeline as the level rises", () => {
    expect(modes("manual")).toMatchObject({
      find: "automatic",
      score: "automatic",
      draft: "you",
      check: "you",
      submit: "approve",
      followup: "you",
    });
    expect(modes("assisted")).toMatchObject({ draft: "approve", submit: "approve" });
    expect(modes("prepared")).toMatchObject({
      draft: "automatic",
      submit: "approve",
      followup: "approve",
    });
    expect(modes("supervised")).toMatchObject({ draft: "automatic", submit: "approve" });
    expect(modes("full")).toMatchObject({
      draft: "automatic",
      submit: "automatic",
      followup: "automatic",
    });
  });

  it("reflects overrides in the timeline", () => {
    const s = {
      ...readAutomation({ automationLevel: "full" }),
      requireSubmissionApproval: true,
      requireMatchApproval: true,
    };
    const plan = Object.fromEntries(stagePlan(s, ctx).map((x) => [x.stage, x.mode]));
    expect(plan.submit).toBe("approve");
    expect(plan.draft).toBe("approve");
    expect(customizedOverrides(s)).toEqual(["requireMatchApproval", "requireSubmissionApproval"]);
  });

  it("only asks for consent when raising into supervised or full", () => {
    expect(needsConsent("prepared", "supervised")).toBe(true);
    expect(needsConsent("supervised", "full")).toBe(true);
    expect(needsConsent("manual", "prepared")).toBe(false);
    expect(needsConsent("full", "supervised")).toBe(false);
  });

  it("sends null for checkpoints that follow the preset", () => {
    const s = applyLevel(readAutomation({ automationLevel: "prepared" }), "full");
    expect(checkpointPatch(s)).toEqual({
      requireMatchApproval: null,
      requireFactConfirmation: null,
      requireDraftReview: null,
      requireSubmissionApproval: null,
      requireFollowupApproval: null,
    });
    expect(checkpointPatch({ ...s, requireFollowupApproval: true }).requireFollowupApproval).toBe(
      true,
    );
  });

  it("lists one locked rail per server safety rail", () => {
    expect(SAFETY_RAILS).toHaveLength(SERVER_RAILS.length);
  });
});

describe("routeApplication with levels", () => {
  const base: RoutingPolicy = {
    autopilotEnabled: false,
    autoSubmitMaxCents: 1_000_000,
    fullReviewAboveCents: 10_000_000,
    minFitScoreForAuto: 80,
    highLikelihoodThreshold: 0.6,
    reviewFirstSubmissionPerFunder: true,
    maxAutoSubmissionsPerMonth: 5,
  };

  it("agrees with the server across levels, overrides and inputs", () => {
    let checked = 0;
    for (const automationLevel of AUTOMATION_LEVELS)
      for (const overrides of [
        {},
        { requireDraftReview: true },
        { requireSubmissionApproval: true },
        { twoPersonRuleAboveCents: 2_000_000 },
      ])
        for (const askCents of [500_000, 5_000_000, 20_000_000])
          for (const fitScore of [60, 90])
            for (const likelihood of [0.2, 0.8])
              for (const firstSubmissionToFunder of [false, true])
                for (const openBlockers of [0, 1]) {
                  const policy: RoutingPolicy = { ...base, automationLevel, ...overrides };
                  const input = {
                    askCents,
                    fitScore,
                    likelihood,
                    firstSubmissionToFunder,
                    autoSubmissionsThisMonth: 0,
                    groundingPassed: true,
                    openBlockers,
                    allCitedFactsConfirmed: true,
                    channelSupportsAuto: true,
                  };
                  const server = decideReviewTier({
                    settings: {
                      ...policy,
                      autopilotEnabled:
                        automationLevel === "supervised" || automationLevel === "full",
                    },
                    requestedAmountCents: askCents,
                    fitScore,
                    likelihood,
                    groundingPassed: true,
                    openBlockers,
                    unconfirmedCitations: 0,
                    isFirstSubmissionToFunder: firstSubmissionToFunder,
                    autoSubmissionsThisMonth: 0,
                    submissionChannelSupportsAuto: true,
                    hasHumanEdits: false,
                    recipientEmailVerified: true,
                    autopilotConsentGranted: true,
                    deadlinePassed: false,
                    billingActive: true,
                    injectionWarnings: 0,
                  });
                  expect(
                    routeApplication(policy, input).tier,
                    `${automationLevel} ${JSON.stringify(overrides)} ${JSON.stringify(input)}`,
                  ).toBe(server.tier);
                  checked++;
                }
    expect(checked).toBeGreaterThan(900);
  });

  it("submits large asks automatically only at Full autopilot", () => {
    const input = {
      askCents: 40_000_000,
      fitScore: 70,
      likelihood: 0.8,
      firstSubmissionToFunder: false,
      autoSubmissionsThisMonth: 0,
      groundingPassed: true,
      openBlockers: 0,
      allCitedFactsConfirmed: true,
      channelSupportsAuto: true,
    };
    expect(routeApplication({ ...base, automationLevel: "full" }, input).tier).toBe("auto");
    expect(routeApplication({ ...base, automationLevel: "supervised" }, input).tier).toBe(
      "full_review",
    );
    expect(
      routeApplication({ ...base, automationLevel: "manual" }, { ...input, askCents: 100 }).tier,
    ).toBe("full_review");
  });
});
