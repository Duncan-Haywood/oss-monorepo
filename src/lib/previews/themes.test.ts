import { describe, expect, it } from "vitest";
import type { BusinessCategory } from "@/lib/leads/types";
import { CATEGORY_THEMES, getCategoryTheme } from "./themes";

/**
 * Direct coverage for category preview shells — sold Starter capability.
 * category-preview.tsx imports getCategoryTheme, but nothing locked the
 * restaurant/salon/trades/generic map (labels, hero eyebrows, accent classes).
 * A silent drift would ship mismatched preview atmosphere without failing Vitest.
 */

const CATEGORIES: BusinessCategory[] = [
  "restaurant",
  "salon",
  "trades",
  "retail",
  "health",
  "automotive",
  "cleaning",
  "fitness",
  "generic",
];

describe("CATEGORY_THEMES", () => {
  it("defines exactly the BusinessCategory keys", () => {
    expect(Object.keys(CATEGORY_THEMES).sort()).toEqual(
      [...CATEGORIES].sort(),
    );
  });

  it("keeps category field aligned with the map key", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_THEMES[category].category).toBe(category);
    }
  });

  it("locks sold category labels and hero eyebrows", () => {
    expect(CATEGORY_THEMES.restaurant).toMatchObject({
      label: "Restaurant & food",
      heroEyebrow: "Dining preview",
      accentTextClass: "text-orange-800",
      ctaClass: "bg-orange-950 text-orange-50 hover:bg-orange-900",
    });
    expect(CATEGORY_THEMES.salon).toMatchObject({
      label: "Salon & beauty",
      heroEyebrow: "Salon preview",
      accentTextClass: "text-rose-800",
      ctaClass: "bg-rose-950 text-rose-50 hover:bg-rose-900",
    });
    expect(CATEGORY_THEMES.trades).toMatchObject({
      label: "Trades & home services",
      heroEyebrow: "Home services preview",
      accentTextClass: "text-teal-900",
      ctaClass: "bg-teal-950 text-teal-50 hover:bg-teal-900",
    });
    expect(CATEGORY_THEMES.retail).toMatchObject({
      label: "Retail & shops",
      heroEyebrow: "Retail preview",
      accentTextClass: "text-violet-800",
      ctaClass: "bg-violet-950 text-violet-50 hover:bg-violet-900",
    });
    expect(CATEGORY_THEMES.automotive).toMatchObject({
      label: "Automotive & auto repair",
      heroEyebrow: "Auto shop preview",
      accentTextClass: "text-red-800",
      ctaClass: "bg-red-950 text-red-50 hover:bg-red-900",
    });
    expect(CATEGORY_THEMES.cleaning).toMatchObject({
      label: "Cleaning services",
      heroEyebrow: "Cleaning service preview",
      accentTextClass: "text-emerald-800",
      ctaClass: "bg-emerald-950 text-emerald-50 hover:bg-emerald-900",
    });
    expect(CATEGORY_THEMES.fitness).toMatchObject({
      label: "Fitness & gyms",
      heroEyebrow: "Gym & studio preview",
      accentTextClass: "text-indigo-800",
      ctaClass: "bg-indigo-950 text-indigo-50 hover:bg-indigo-900",
    });
    expect(CATEGORY_THEMES.generic).toMatchObject({
      label: "Local business",
      heroEyebrow: "Business preview",
      accentTextClass: "text-slate-700",
      ctaClass: "bg-zinc-900 text-white hover:bg-zinc-800",
    });
  });

  it("keeps distinct shell / panel classes per category (no shared copy-paste)", () => {
    const shells = CATEGORIES.map((c) => CATEGORY_THEMES[c].shellClass);
    const panels = CATEGORIES.map((c) => CATEGORY_THEMES[c].panelClass);
    expect(new Set(shells).size).toBe(CATEGORIES.length);
    expect(new Set(panels).size).toBe(CATEGORIES.length);
  });

  it("uses full-bleed gradient shells (not flat single-color backgrounds)", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_THEMES[category].shellClass).toContain("min-h-screen");
      expect(CATEGORY_THEMES[category].shellClass).toContain(
        "radial-gradient",
      );
    }
  });
});

describe("getCategoryTheme", () => {
  it("returns the matching CATEGORY_THEMES entry for each category", () => {
    for (const category of CATEGORIES) {
      expect(getCategoryTheme(category)).toBe(CATEGORY_THEMES[category]);
    }
  });
});
