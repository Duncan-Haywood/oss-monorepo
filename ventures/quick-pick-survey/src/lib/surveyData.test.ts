import { describe, expect, it } from "vitest";
import { SEED_SURVEYS } from "@/lib/surveyData";

describe("survey content", () => {
  it("has no duplicate item slugs inside a survey", () => {
    for (const survey of SEED_SURVEYS) {
      const slugs = survey.items.map((item) => item.slug);
      expect(new Set(slugs).size, `${survey.slug} contains duplicate item slugs`).toBe(slugs.length);
    }
  });

  it("retains concrete prompts across recurring couple pressure points", () => {
    const labels = SEED_SURVEYS
      .filter((survey) =>
        [
          "relationship",
          "communication",
          "lifestyle",
          "intimacy",
          "future-family",
          "money-power",
          "stress-support",
          "trust-boundaries",
          "play-growth",
        ].includes(survey.slug)
      )
      .flatMap((survey) => survey.items.map((item) => item.label));

    expect(labels).toEqual(
      expect.arrayContaining([
        "Can apologise specifically and change what happens next",
        "Balances shared money with some financial independence for each person",
        "Can rebuild closeness after stress, illness, or a difficult season",
        "Can divide childcare and caregiving without defaulting silently to one person",
        "Gives both people an equal voice even when one earns much more",
        "Can temporarily carry more without turning it into permanent scorekeeping",
        "Never uses something vulnerable you shared as ammunition later",
        "Keeps getting curious about who you are becoming",
      ])
    );
  });

  it("keeps each couple topic deep enough to support within-topic trade-offs", () => {
    for (const slug of ["money-power", "stress-support", "trust-boundaries", "play-growth"]) {
      const survey = SEED_SURVEYS.find((candidate) => candidate.slug === slug);
      expect(survey?.items.length, `${slug} is too shallow`).toBeGreaterThanOrEqual(10);
    }
  });
});
