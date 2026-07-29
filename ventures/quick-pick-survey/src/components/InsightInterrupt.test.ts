import { describe, expect, it } from "vitest";
import {
  buildInsightMoment,
  buildPartnerPromptText,
} from "@/components/InsightInterrupt";

describe("buildInsightMoment", () => {
  it("turns a measured trade-off into a couple conversation prompt", () => {
    const moment = buildInsightMoment("tradeoffs", {
      tradeoffs: {
        summary: "Warmth wins when it directly conflicts with status.",
        tradeoffs: [
          { winnerLabel: "Warmth", loserLabel: "Status", rate: 0.72 },
        ],
      },
    });

    expect(moment?.title).toContain("Warmth");
    expect(moment?.details).toContain("Chosen in 72% of direct comparisons");
    expect(moment?.conversationPrompt).toMatch(/partner/i);
  });

  it("refuses to interrupt for a value profile without enough supported dimensions", () => {
    const moment = buildInsightMoment("value-profile", {
      "value-profile": { scores: [{ label: "Warmth", delta: 20, n: 1 }] },
    });
    expect(moment).toBeNull();
  });

  it("turns the prompt into a ready-to-send message for the partner", () => {
    const text = buildPartnerPromptText("Would you have guessed warmth wins for me?");

    expect(text).toBe(
      "Pairwise gave me a question for us:\n\n“Would you have guessed warmth wins for me?”\n\nWhat do you think?",
    );
  });
});
