import { describe, expect, it } from "vitest";
import { getLeadBySlug, isCuratedDemoLeadSlug } from "@/lib/leads/demo-catalog";
import { getBundle } from "@/lib/pricing/bundles";
import {
  CATEGORY_LANDING_PAGES,
  MAX_CATEGORY_META_DESCRIPTION_LENGTH,
  MAX_CATEGORY_SEO_TITLE_LENGTH,
  categoryLandingPageByHref,
} from "./category-landing";
import { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } from "./monthly-pack";

describe("CATEGORY_LANDING_PAGES", () => {
  it("has one entry per non-generic BusinessCategory, each with a unique href", () => {
    const categories = CATEGORY_LANDING_PAGES.map((page) => page.category);
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories.sort()).toEqual([
      "automotive",
      "cleaning",
      "fitness",
      "health",
      "restaurant",
      "retail",
      "salon",
      "trades",
    ]);

    const hrefs = CATEGORY_LANDING_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
    }
  });

  it("points recommendedTier at a real bundle and exampleLeadSlug at a curated, always-indexable demo lead", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      const bundle = getBundle(page.recommendedTier);
      expect(bundle, `${page.href}: recommendedTier "${page.recommendedTier}" is not a real bundle`).toBeDefined();

      const lead = getLeadBySlug(page.exampleLeadSlug);
      expect(lead, `${page.href}: exampleLeadSlug "${page.exampleLeadSlug}" is not a real demo lead`).toBeDefined();
      expect(lead?.category).toBe(page.category);
      expect(isCuratedDemoLeadSlug(page.exampleLeadSlug)).toBe(true);
    }
  });

  it("keeps metaDescription under the Google SERP-truncation width", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      expect(
        page.metaDescription.length,
        `${page.href}: metaDescription is ${page.metaDescription.length} chars, over MAX_CATEGORY_META_DESCRIPTION_LENGTH (${MAX_CATEGORY_META_DESCRIPTION_LENGTH}) — Google will truncate it mid-sentence in search results: "${page.metaDescription}"`,
      ).toBeLessThanOrEqual(MAX_CATEGORY_META_DESCRIPTION_LENGTH);
    }
  });

  it("keeps seoTitle under the Google SERP title-truncation width", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      expect(
        page.seoTitle.length,
        `${page.href}: seoTitle is ${page.seoTitle.length} chars, over MAX_CATEGORY_SEO_TITLE_LENGTH (${MAX_CATEGORY_SEO_TITLE_LENGTH}) — Google will truncate it mid-word in search results: "${page.seoTitle}"`,
      ).toBeLessThanOrEqual(MAX_CATEGORY_SEO_TITLE_LENGTH);
    }
  });

  it("has non-empty copy for every field a page renders", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      expect(page.seoTitle.length).toBeGreaterThan(0);
      expect(page.metaDescription.length).toBeGreaterThan(0);
      expect(page.heroHeadline.length).toBeGreaterThan(0);
      expect(page.heroSubhead.length).toBeGreaterThan(0);
      expect(page.painPoints.length).toBeGreaterThan(0);
      expect(page.features.length).toBeGreaterThan(0);
      expect(page.faq.length).toBeGreaterThan(0);
      for (const entry of page.faq) {
        expect(entry.question.length).toBeGreaterThan(0);
        expect(entry.answer.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("monthly marketing cadence copy", () => {
  it("derives the salon page's cadence copy from monthlyMarketingSocialPostCount/monthlyMarketingEmailCount, not a hardcoded literal", () => {
    const cadence = `${monthlyMarketingSocialPostCount()} social/GBP posts + ${monthlyMarketingEmailCount()} emails`;
    const salon = categoryLandingPageByHref("/websites-for-salons");
    expect(salon?.features.some((feature) => feature.includes(cadence))).toBe(true);
    expect(salon?.faq.some((entry) => entry.answer.includes(cadence))).toBe(true);
  });
});

describe("add-on gating stays consistent between SEO copy and features/FAQ", () => {
  it("never advertises online ordering in seoTitle/metaDescription without qualifying it as the optional Commerce add-on", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      const advertisesOnlineOrdering = page.features.some((feature) =>
        feature.includes("online ordering"),
      );
      if (!advertisesOnlineOrdering) continue;

      const isGatedBehindCommerceAddon = page.features.some(
        (feature) => feature.includes("online ordering") && feature.includes("Commerce add-on"),
      );
      if (!isGatedBehindCommerceAddon) continue;

      for (const copy of [page.seoTitle, page.metaDescription]) {
        if (!copy.includes("online ordering")) continue;
        expect(
          /optional|add-on/i.test(copy),
          `${page.href}: "${copy}" mentions online ordering as if included, but it's gated behind the Commerce add-on`,
        ).toBe(true);
      }
    }
  });
});

describe("categoryLandingPageByHref", () => {
  it("finds the matching page by href", () => {
    const page = categoryLandingPageByHref("/websites-for-salons");
    expect(page?.category).toBe("salon");
  });

  it("returns undefined for an unknown href", () => {
    expect(categoryLandingPageByHref("/websites-for-does-not-exist")).toBeUndefined();
  });
});
