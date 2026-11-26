import { describe, expect, it } from "vitest";
import {
  type CaseOutcome,
  eligibilityCorrect,
  gainOf,
  isFalseEligible,
  ndcgAt,
  precisionAt,
  realCitationShare,
  trapCaught,
} from "./metrics";

const outcome = (o: Partial<CaseOutcome> = {}): CaseOutcome => ({
  droppedByPrefilter: false,
  duplicateOf: null,
  eligibility: "likely_eligible",
  fitScore: 80,
  rank: 1,
  ...o,
});

describe("ranking metrics", () => {
  it("NDCG is 1 for the ideal order, lower when relevant items are dropped or late", () => {
    expect(ndcgAt([2, 1, 0], [0, 1, 2], 5)).toBeCloseTo(1);
    expect(ndcgAt([0, 1, 2], [0, 1, 2], 5)).toBeLessThan(1);
    expect(ndcgAt([1], [2, 1], 5)).toBeLessThan(ndcgAt([2, 1], [2, 1], 5));
    expect(ndcgAt([], [0, 0], 5)).toBe(1);
  });

  it("precision@k counts empty slots as misses; gains zero out gold-ineligible items", () => {
    expect(precisionAt([2, 0, 1], 5)).toBeCloseTo(0.4);
    expect(gainOf({ relevance: 2, eligible: false, reason: "" })).toBe(0);
    expect(gainOf({ relevance: 2, eligible: "unknown", reason: "" })).toBe(2);
  });
});

describe("eligibility", () => {
  it("treats likely_eligible as a claim of eligibility", () => {
    expect(isFalseEligible("unknown", "likely_eligible")).toBe(true);
    expect(isFalseEligible(false, "eligible")).toBe(true);
    expect(isFalseEligible(true, "likely_eligible")).toBe(false);
    expect(isFalseEligible("unknown", "unknown")).toBe(false);
    expect(eligibilityCorrect("unknown", "unknown")).toBe(true);
    expect(eligibilityCorrect(true, "ineligible")).toBe(false);
  });
});

describe("traps", () => {
  it("applies each trap's catch rule", () => {
    expect(trapCaught("wrong_state", outcome({ droppedByPrefilter: true }), 60)).toBe(true);
    expect(trapCaught("tribal_gov_only", outcome({ eligibility: "ineligible" }), 60)).toBe(true);
    expect(trapCaught("for_profit_only", outcome(), 60)).toBe(false);
    expect(trapCaught("deadline_passed", outcome({ eligibility: "ineligible" }), 60)).toBe(false);
    expect(trapCaught("near_duplicate", outcome({ duplicateOf: "x" }), 60)).toBe(true);
    expect(trapCaught("sam_no_uei", outcome({ eligibility: "unknown" }), 60)).toBe(true);
    expect(trapCaught("sam_no_uei", outcome(), 60)).toBe(false);
    expect(trapCaught("keyword_stuffed", outcome({ fitScore: 20, rank: 9 }), 60)).toBe(true);
    expect(trapCaught("keyword_stuffed", outcome({ fitScore: 20, rank: 3 }), 60)).toBe(false);
    expect(trapCaught("keyword_stuffed", outcome({ fitScore: 70, rank: 9 }), 60)).toBe(false);
  });
});

describe("realCitationShare", () => {
  it("measures raw reasons that cite ids, flagging ids outside the prompt", () => {
    const r = realCitationShare(
      [{ factIds: ["fct_a"] }, { factIds: ["fct_a", "fct_zz"] }, { factIds: [] }],
      new Set(["fct_a"]),
    );
    expect(r).toEqual({ citing: 2, allReal: 1, fabricatedIds: ["fct_zz"] });
  });
});
