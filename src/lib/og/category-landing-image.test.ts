import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { categoryLandingOgImageAlt } from "./category-landing-image";

describe("categoryLandingOgImageAlt", () => {
  it("combines the page's SEO title and the brand name", () => {
    const restaurant = CATEGORY_LANDING_PAGES.find(
      (page) => page.category === "restaurant",
    )!;
    expect(categoryLandingOgImageAlt(restaurant)).toBe(
      `${restaurant.seoTitle} — ${brand.name}`,
    );
  });

  it("produces a distinct alt string per category page", () => {
    const alts = CATEGORY_LANDING_PAGES.map((page) => categoryLandingOgImageAlt(page));
    expect(new Set(alts).size).toBe(CATEGORY_LANDING_PAGES.length);
  });

  it("starts with the page's own SEO title, not a generic site-wide string", () => {
    for (const page of CATEGORY_LANDING_PAGES) {
      expect(categoryLandingOgImageAlt(page).startsWith(page.seoTitle)).toBe(true);
    }
  });
});
