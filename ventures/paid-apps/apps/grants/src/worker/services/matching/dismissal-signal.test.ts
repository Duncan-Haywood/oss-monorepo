import { describe, expect, it } from "vitest";
import {
  applyDismissalSignal,
  type DismissalSignal,
  dismissalAdjustment,
  type FunderRef,
  MAX_DISMISS_FIT_PENALTY,
  normalizeFunderName,
  sameFunder,
} from "./dismissal-signal";
import type { FinalScore } from "./scoring";

const target = (o: Partial<FunderRef> = {}): FunderRef => ({
  opportunityId: "opp_new",
  funderId: null,
  funderName: "Acme Community Foundation",
  maxAwardCents: 1_000_000,
  ...o,
});

const signal = (o: Partial<DismissalSignal> = {}): DismissalSignal => ({
  opportunityId: "opp_old",
  funderId: null,
  funderName: "Acme Community Foundation",
  maxAwardCents: 1_000_000,
  reason: "wrong_focus",
  ...o,
});

const score = (o: Partial<FinalScore> = {}): FinalScore => ({
  eligibility: "likely_eligible",
  fitScore: 70,
  likelihood: 0.2,
  suggestedAskCents: 1_000_000,
  expectedValueCents: 200_000,
  effortHours: 10,
  reasons: [{ text: "Solid fit", polarity: "positive", factIds: ["fct_1"] }],
  projectId: null,
  ...o,
});

describe("sameFunder", () => {
  it("matches by funder id when both have one, else by normalized name", () => {
    expect(normalizeFunderName("  ACME Community-Foundation, Inc. ")).toBe(
      "acme community foundation inc",
    );
    expect(sameFunder(target({ funderName: "ACME community foundation" }), signal())).toBe(true);
    expect(sameFunder(target({ funderId: "fnd_1" }), signal({ funderId: "fnd_1" }))).toBe(true);
    expect(sameFunder(target({ funderId: "fnd_1" }), signal({ funderId: "fnd_2" }))).toBe(false);
    expect(sameFunder(target({ funderId: "fnd_1" }), signal())).toBe(true); // falls back to name
    expect(sameFunder(target({ funderName: "Other Trust" }), signal())).toBe(false);
    expect(sameFunder(target({ funderName: "" }), signal({ funderName: "" }))).toBe(false);
  });
});

describe("dismissalAdjustment", () => {
  it("is zero without a same-funder signal", () => {
    expect(dismissalAdjustment(target(), [])).toEqual({ penalty: 0, reason: null });
    expect(dismissalAdjustment(target({ funderName: "Other" }), [signal()]).penalty).toBe(0);
  });

  it("ignores the dismissed opportunity itself", () => {
    expect(dismissalAdjustment(target({ opportunityId: "opp_old" }), [signal()]).penalty).toBe(0);
  });

  it("penalizes wrong_focus 15 and too_small 10, capped, and explains it", () => {
    expect(dismissalAdjustment(target(), [signal()])).toEqual({
      penalty: 15,
      reason: {
        text: "Fit lowered by 15 points: you dismissed 1 similar grant from Acme Community Foundation (wrong focus).",
        polarity: "negative",
        factIds: [],
      },
    });
    expect(dismissalAdjustment(target(), [signal({ reason: "too_small" })]).penalty).toBe(10);
    const many = dismissalAdjustment(target(), [
      signal(),
      signal({ opportunityId: "opp_2" }),
      signal({ opportunityId: "opp_3", reason: "too_small" }),
    ]);
    expect(many.penalty).toBe(MAX_DISMISS_FIT_PENALTY);
    expect(many.reason?.text).toContain("3 similar grants");
    expect(many.reason?.text).toContain("(wrong focus, too small)");
  });

  it("does not carry too_small over to a larger award", () => {
    const old = signal({ reason: "too_small", maxAwardCents: 500_000 });
    expect(dismissalAdjustment(target({ maxAwardCents: 5_000_000 }), [old]).penalty).toBe(0);
    expect(dismissalAdjustment(target({ maxAwardCents: 500_000 }), [old]).penalty).toBe(10);
    expect(dismissalAdjustment(target({ maxAwardCents: null }), [old]).penalty).toBe(10);
  });
});

describe("applyDismissalSignal", () => {
  it("lowers only the fit (floored at 0) and appends the reason", () => {
    const out = applyDismissalSignal(score(), target(), [signal()]);
    expect(out.fitScore).toBe(55);
    expect(out.likelihood).toBe(0.2);
    expect(out.expectedValueCents).toBe(200_000);
    expect(out.reasons).toHaveLength(2);
    expect(out.reasons[0]?.text).toBe("Solid fit");
    expect(out.reasons[1]?.polarity).toBe("negative");
    expect(applyDismissalSignal(score({ fitScore: 5 }), target(), [signal()]).fitScore).toBe(0);
  });

  it("returns the score untouched without a signal", () => {
    const s = score();
    expect(applyDismissalSignal(s, target(), [])).toBe(s);
  });
});
