import { describe, expect, it } from "vitest";
import {
  selectCoupleInsightBreak,
  selectInsightBreak,
  shouldCheckForInsight,
} from "@/lib/insightBreaks";

describe("selectInsightBreak", () => {
  it("does not interrupt for a level boundary without a concrete finding", () => {
    expect(selectInsightBreak({ totalAnswers: 10, content: {} }, "PARTNER")).toBeNull();
  });

  it("does not present a contested leader as a discovery", () => {
    expect(
      selectInsightBreak(
        {
          totalAnswers: 20,
          content: { "top-pick": { label: "Repairs after conflict", contested: true } },
        },
        "PARTNER"
      )
    ).toBeNull();
  });

  it("turns a measured trade-off into a couple conversation", () => {
    const result = selectInsightBreak(
      {
        totalAnswers: 30,
        content: {
          tradeoffs: {
            summary: "You repeatedly choose calm conflict repair over social confidence.",
            tradeoffs: [{ n: 5, rate: 0.8 }],
          },
        },
      },
      "PARTNER"
    );

    expect(result).toMatchObject({
      key: "tradeoffs",
      eyebrow: "A real trade-off",
      prompt: "Is this something your partner already knows matters to you?",
    });
  });

  it("prefers a concrete couple prompt over a more general profile", () => {
    const result = selectInsightBreak(
      {
        totalAnswers: 25,
        content: {
          "couple-prompt": {
            label: "Can pause a heated argument—and reliably return to it",
            contrast: "Has a similar rhythm for texts and calls",
          },
          "value-profile": {
            summary: "Your choices consistently favour steadiness and direct communication.",
          },
        },
      },
      "PARTNER"
    );

    expect(result).toMatchObject({
      key: "couple-prompt",
      eyebrow: "Worth asking each other",
      prompt: "Ask them what they thought you would choose before you reveal it.",
    });
  });

  it("never interrupts twice for the same kind of finding", () => {
    const result = selectInsightBreak(
      {
        totalAnswers: 40,
        content: {
          "value-profile": {
            summary: "Your choices consistently favour steadiness and direct communication.",
            scores: [{ label: "Stability", delta: 24, n: 3 }],
          },
          "top-pick": { label: "Repairs quickly after a fight", contested: false },
        },
      },
      "PARTNER_GUESS",
      new Set(["value-profile"])
    );

    expect(result).toMatchObject({
      key: "top-pick",
      prompt: "Would they describe themselves this way?",
    });
  });

  it("keeps a weak category lead on the insights page instead of interrupting", () => {
    const result = selectInsightBreak(
      {
        totalAnswers: 30,
        content: {
          "category-lean": [
            { name: "Communication", avg: 1520, n: 3 },
            { name: "Relationship", avg: 1512, n: 4 },
          ],
        },
      },
      "PARTNER",
    );

    expect(result).toBeNull();
  });
});

describe("shouldCheckForInsight", () => {
  it("checks every five answers but leaves ten answers between interruptions", () => {
    expect(shouldCheckForInsight(5, 0)).toBe(false);
      expect(shouldCheckForInsight(10, 0)).toBe(false);
      expect(shouldCheckForInsight(15, 0)).toBe(true);
      expect(shouldCheckForInsight(20, 15)).toBe(false);
      expect(shouldCheckForInsight(30, 15)).toBe(true);
      expect(shouldCheckForInsight(31, 15)).toBe(false);
  });
});

describe("selectCoupleInsightBreak", () => {
  it("promotes a confidence-gated action from the partner's own answers", () => {
    const result = selectCoupleInsightBreak(
      {
        couple: { partner: { firstName: "Sam" } },
        makeThemHappy: [
          { label: "Notices and carries the invisible mental load", category: "Behaviour" },
        ],
      },
      35
    );

    expect(result).toMatchObject({
      key: "couple-action",
      headline: "Notices and carries the invisible mental load",
      prompt: "Ask Sam: “What would this look like on an ordinary week?”",
      experiment: expect.stringMatching(/this week/i),
    });
  });

  it("does not manufacture a couple insight without a linked partner", () => {
    expect(
      selectCoupleInsightBreak(
        { makeThemHappy: [{ label: "Repairs quickly after a fight" }] },
        40
      )
    ).toBeNull();
  });
});
