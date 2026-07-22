import { describe, expect, it } from "vitest";
import {
  BUSINESS_CATEGORIES,
  normalizeLeadCategory,
  normalizeLeadRecommendedTier,
  RECOMMENDED_TIERS,
} from "./category-normalize";

describe("normalizeLeadCategory", () => {
  it("passes through every recognized category unchanged", () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(normalizeLeadCategory(category)).toBe(category);
    }
  });

  it("falls back to generic for an unrecognized/legacy stored value", () => {
    expect(normalizeLeadCategory("not-a-real-category")).toBe("generic");
    expect(normalizeLeadCategory("")).toBe("generic");
    expect(normalizeLeadCategory("Restaurant")).toBe("generic"); // case-sensitive, not fuzzy
  });
});

describe("normalizeLeadRecommendedTier", () => {
  it("passes through every recognized tier unchanged, regardless of category", () => {
    for (const tier of RECOMMENDED_TIERS) {
      expect(normalizeLeadRecommendedTier(tier, "generic")).toBe(tier);
    }
  });

  it("falls back to the category-derived default for an unrecognized/missing value", () => {
    expect(normalizeLeadRecommendedTier("not-a-real-tier", "trades")).toBe("starter");
    expect(normalizeLeadRecommendedTier("not-a-real-tier", "salon")).toBe("complete");
    expect(normalizeLeadRecommendedTier("not-a-real-tier", "restaurant")).toBe("growth");
    expect(normalizeLeadRecommendedTier("not-a-real-tier", "generic")).toBe("growth");
    expect(normalizeLeadRecommendedTier(undefined, "trades")).toBe("starter");
    expect(normalizeLeadRecommendedTier(null, "salon")).toBe("complete");
  });
});
