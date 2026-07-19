import { describe, expect, it } from "vitest";
import {
  leadOgImageAccentHex,
  truncateForOgImage,
} from "./lead-preview-image";

describe("truncateForOgImage", () => {
  it("returns the value unchanged when within the limit", () => {
    expect(truncateForOgImage("Pine Cafe", 48)).toBe("Pine Cafe");
  });

  it("truncates and appends an ellipsis when over the limit", () => {
    const result = truncateForOgImage(
      "A Very Long Business Name That Would Never Fit On A Card",
      20,
    );
    expect(result.length).toBe(20);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toBe("A Very Long Busines…");
  });

  it("trims trailing whitespace before the ellipsis", () => {
    expect(truncateForOgImage("Word boundary cut here", 14)).toBe(
      "Word boundary…",
    );
  });

  it("handles a limit of zero without throwing", () => {
    expect(truncateForOgImage("anything", 0)).toBe("…");
  });
});

describe("leadOgImageAccentHex", () => {
  it("returns a distinct hex color per category", () => {
    const restaurant = leadOgImageAccentHex("restaurant");
    const salon = leadOgImageAccentHex("salon");
    const trades = leadOgImageAccentHex("trades");
    const generic = leadOgImageAccentHex("generic");
    const values = new Set([restaurant, salon, trades, generic]);
    expect(values.size).toBe(4);
    for (const hex of values) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
