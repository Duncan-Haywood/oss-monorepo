import { describe, expect, it } from "vitest";
import { computeTraitVectorProfile, enrichItemsWithTraits, RatedCardWithTraits } from "./aiTraitTagger";

describe("aiTraitTagger", () => {
  it("enriches items with default traits metadata", () => {
    const rawItems = [
      { label: "Bring morning coffee", category: "Romance", dimensions: ["Words of Affirmation"] },
    ];
    const enriched = enrichItemsWithTraits(rawItems);
    expect(enriched[0].traits).toBeDefined();
    expect(enriched[0].traits.loveLanguages).toBeDefined();
    expect(Array.isArray(enriched[0].traits.loveLanguages)).toBe(true);
  });

  it("computes weighted trait vector profile from top-rated cards", () => {
    const mockCard: RatedCardWithTraits = {
      label: "Deep late night talks",
      category: "Intimacy",
      rating: 1650,
      rd: 120,
      strengthPercentile: 85,
      traits: {
        loveLanguages: ["Quality Time", "Words of Affirmation"],
        relationalDrivers: ["Vulnerability & Intimacy"],
        stressResponse: ["Co-Regulation"],
        lifeVision: ["Shared Growth"],
        communicationStyle: ["Reflective & Deep"],
        effortProfile: {
          timeIntensity: "Low",
          costLevel: "Low",
          vulnerabilityLevel: "High",
          frequency: "Periodic Event",
        },
      },
    };

    const profile = computeTraitVectorProfile([mockCard], true);

    expect(profile.highVulnerabilityCardCount).toBe(1);
    expect(profile.topLoveLanguages.length).toBeGreaterThan(0);
    expect(profile.topLoveLanguages[0].trait).toBe("Quality Time");
    expect(profile.topLoveLanguages[0].score).toBe(0.9); // 0.85 rounded to 1 decimal
  });
});
