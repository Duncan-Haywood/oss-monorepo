import { decideReviewTier } from "@worker/services/review/policy";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_GRANTS,
  type RoutingInput,
  type RoutingPolicy,
  routeApplication,
} from "./routing-preview";

const defaults: RoutingPolicy = {
  autopilotEnabled: false,
  autoSubmitMaxCents: 1_000_000,
  fullReviewAboveCents: 10_000_000,
  minFitScoreForAuto: 80,
  highLikelihoodThreshold: 0.6,
  reviewFirstSubmissionPerFunder: true,
  maxAutoSubmissionsPerMonth: 5,
};
const on: RoutingPolicy = { ...defaults, autopilotEnabled: true };

const perfect: RoutingInput = {
  askCents: 500_000,
  fitScore: 90,
  likelihood: 0.4,
  firstSubmissionToFunder: false,
  autoSubmissionsThisMonth: 0,
  groundingPassed: true,
  openBlockers: 0,
  allCitedFactsConfirmed: true,
  channelSupportsAuto: true,
};

describe("routeApplication", () => {
  it("never auto-submits while autopilot is off (conservative default)", () => {
    const r = routeApplication(defaults, perfect);
    expect(r.tier).toBe("one_click");
    expect(r.reasons).toContain("Autopilot is off");
  });

  it("auto-submits when autopilot is on and every gate passes", () => {
    expect(routeApplication(on, perfect).tier).toBe("auto");
  });

  it("treats the auto-submit limit as inclusive", () => {
    expect(routeApplication(on, { ...perfect, askCents: 1_000_000 }).tier).toBe("auto");
    expect(routeApplication(on, { ...perfect, askCents: 1_000_001 }).tier).toBe("one_click");
  });

  it("sends asks above the full-review line to full review even with autopilot on", () => {
    const r = routeApplication(on, { ...perfect, askCents: 10_000_001 });
    expect(r.tier).toBe("full_review");
    expect(r.reasons[0]).toMatch(/full-review line/);
  });

  it("sends open blockers and high-likelihood grants to full review", () => {
    expect(routeApplication(on, { ...perfect, openBlockers: 2 }).tier).toBe("full_review");
    const r = routeApplication(on, { ...perfect, likelihood: 0.6 });
    expect(r.tier).toBe("full_review");
    expect(r.reasons[0]).toMatch(/Good chance of winning/);
  });

  it.each<[string, Partial<RoutingInput>]>([
    ["low fit", { fitScore: 79 }],
    ["failed grounding", { groundingPassed: false }],
    ["a channel that needs a person", { channelSupportsAuto: false }],
    ["first submission to funder", { firstSubmissionToFunder: true }],
    ["monthly cap reached", { autoSubmissionsThisMonth: 5 }],
    ["unconfirmed facts", { allCitedFactsConfirmed: false }],
  ])("requires a human (one_click) for %s", (_name, patch) => {
    expect(routeApplication(on, { ...perfect, ...patch }).tier).toBe("one_click");
  });

  it("allows a repeat-funder-only policy to auto-submit to new funders when disabled", () => {
    const policy = { ...on, reviewFirstSubmissionPerFunder: false };
    expect(routeApplication(policy, { ...perfect, firstSubmissionToFunder: true }).tier).toBe(
      "auto",
    );
  });

  it("routes the three example grants sensibly under default settings", () => {
    const tiers = EXAMPLE_GRANTS.map((g) => routeApplication(defaults, g.input).tier);
    expect(tiers).toEqual(["one_click", "one_click", "full_review"]);
    const tiersOn = EXAMPLE_GRANTS.map((g) => routeApplication(on, g.input).tier);
    expect(tiersOn).toEqual(["auto", "one_click", "full_review"]);
  });

  it("agrees with the server's review policy across a grid of inputs", () => {
    const policies = [defaults, on, { ...on, reviewFirstSubmissionPerFunder: false }];
    let checked = 0;
    for (const policy of policies)
      for (const askCents of [500_000, 1_000_000, 5_000_000, 20_000_000])
        for (const fitScore of [60, 80, 95])
          for (const likelihood of [0.2, 0.6, 0.9])
            for (const firstSubmissionToFunder of [false, true])
              for (const openBlockers of [0, 1])
                for (const allCitedFactsConfirmed of [true, false]) {
                  const input = {
                    ...perfect,
                    askCents,
                    fitScore,
                    likelihood,
                    firstSubmissionToFunder,
                    openBlockers,
                    allCitedFactsConfirmed,
                  };
                  const server = decideReviewTier({
                    settings: policy,
                    requestedAmountCents: askCents,
                    fitScore,
                    likelihood,
                    groundingPassed: input.groundingPassed,
                    openBlockers,
                    unconfirmedCitations: allCitedFactsConfirmed ? 0 : 1,
                    isFirstSubmissionToFunder: firstSubmissionToFunder,
                    autoSubmissionsThisMonth: input.autoSubmissionsThisMonth,
                    submissionChannelSupportsAuto: input.channelSupportsAuto,
                    hasHumanEdits: false,
                    // Safety rails the client preview assumes hold (they fail closed if omitted).
                    recipientEmailVerified: true,
                    autopilotConsentGranted: true,
                    deadlinePassed: false,
                    billingActive: true,
                    injectionWarnings: 0,
                  });
                  expect(routeApplication(policy, input).tier).toBe(server.tier);
                  checked++;
                }
    expect(checked).toBeGreaterThan(400);
  });
});
