import { describe, expect, it } from "vitest";
import {
  BUSINESS_CATEGORIES,
  defaultTierForCategory,
  normalizeLeadCategory,
  normalizeLeadRecommendedTier,
  RECOMMENDED_TIERS,
} from "./category-normalize";
import { CATEGORY_DEFAULT_TIER } from "./quality-score";
import { resolvePreviewLead } from "./demo-catalog";
import { parseLeadsCsv } from "./csv-import";

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

describe("defaultTierForCategory cross-site consistency", () => {
  // quality-score.ts's CATEGORY_DEFAULT_TIER and demo-catalog.ts's
  // resolvePreviewLead both now derive from defaultTierForCategory rather
  // than re-implementing the trades/salon/else split — pin all three to
  // agree so a future edit to only one site fails immediately, the same
  // bug class default-tagline.test.ts guards against for taglines.
  it("CATEGORY_DEFAULT_TIER matches defaultTierForCategory for every category", () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(CATEGORY_DEFAULT_TIER[category]).toBe(defaultTierForCategory(category));
    }
  });

  it("resolvePreviewLead's inferred recommendedTier matches defaultTierForCategory", () => {
    const slugByCategory = {
      restaurant: "hearth-bakery",
      salon: "luxe-salon",
      trades: "peak-plumbing",
      retail: "corner-mercantile",
      health: "riverside-wellness-clinic",
      automotive: "riverside-auto-garage",
      cleaning: "riverside-cleaning-co",
      fitness: "riverside-fitness-gym",
      legal: "riverside-law-group",
      generic: "acme-services",
    } as const;
    for (const category of BUSINESS_CATEGORIES) {
      const lead = resolvePreviewLead(slugByCategory[category]);
      expect(lead.category).toBe(category);
      expect(lead.recommendedTier).toBe(defaultTierForCategory(category));
    }
  });

  it("CSV import's inferred recommendedTier matches defaultTierForCategory for a blank recommendedTier column", () => {
    for (const category of BUSINESS_CATEGORIES) {
      const result = parseLeadsCsv(`businessName,category\nAcme,${category}`);
      expect(result.leads[0]?.category).toBe(category);
      expect(result.leads[0]?.recommendedTier).toBe(defaultTierForCategory(category));
    }
  });
});
