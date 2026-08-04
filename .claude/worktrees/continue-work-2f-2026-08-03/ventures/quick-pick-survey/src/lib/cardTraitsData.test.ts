import { describe, it, expect } from "vitest";
import { getTraitsForItem, CARD_TRAITS_REGISTRY } from "@/lib/cardTraitsData";
import { enrichItemsWithTraits, computeTraitVectorProfile, RatedCardWithTraits } from "@/lib/aiTraitTagger";

describe("cardTraitsData", () => {
  it("resolves explicitly registered traits correctly", () => {
    const traits = getTraitsForItem({ slug: "listens-fully", label: "Puts the phone down and actually listens" });
    expect(traits.loveLanguages).toContain("Quality Time");
    expect(traits.relationalDrivers).toContain("Vulnerability & Intimacy");
    expect(traits.stressResponse).toContain("Emotional Reassurance");
  });

  it("synthesizes fallback traits intelligently for unannotated items", () => {
    const traits = getTraitsForItem({
      label: "Custom unannotated adventure card",
      category: "Aviation and travel",
      dimensions: ["adventure", "physicality"],
    });
    expect(traits.loveLanguages).toContain("Quality Time");
    expect(traits.relationalDrivers).toContain("Novelty & Adventure");
  });

  it("computes weighted trait vector profile from rated cards", () => {
    const mockCards: RatedCardWithTraits[] = [
      {
        label: "Puts the phone down and actually listens",
        category: "Behaviour",
        rating: 1650,
        rd: 120,
        strengthPercentile: 95,
        traits: getTraitsForItem({ slug: "listens-fully", label: "Puts the phone down and actually listens" }),
      },
      {
        label: "Plans thoughtful dates without being asked",
        category: "Behaviour",
        rating: 1600,
        rd: 130,
        strengthPercentile: 85,
        traits: getTraitsForItem({ slug: "plans-dates", label: "Plans thoughtful dates without being asked" }),
      },
    ];

    const profile = computeTraitVectorProfile(mockCards, true);
    expect(profile.topLoveLanguages.length).toBeGreaterThan(0);
    expect(profile.topLoveLanguages[0].trait).toBe("Quality Time");
    expect(profile.topRelationalDrivers.length).toBeGreaterThan(0);
  });
});
