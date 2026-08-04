import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  composite,
  contrastRatio,
  hexToRgb,
  oklchToRgb,
  parsePalette,
  relativeLuminance,
  resolveToken,
} from "./contrast";

/**
 * The audit that uses this module reports a number and asks people to trust it,
 * so the number has to be checkable against something other than itself. Each
 * case below is either a value fixed by the WCAG definition or one Tailwind
 * publishes for its own palette.
 */

const PALETTE = parsePalette(
  readFileSync(join(process.cwd(), "node_modules/tailwindcss/theme.css"), "utf8"),
);

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, { r: 119, g: 119, b: 119 })).toBe(1);
  });

  it("does not depend on which colour is given first", () => {
    const grey = { r: 115, g: 115, b: 115 };
    expect(contrastRatio(grey, WHITE)).toBeCloseTo(contrastRatio(WHITE, grey), 10);
  });

  it("matches the worked example in the WCAG definition", () => {
    // #767676 on white is the canonical "just passes AA" grey: 4.54:1.
    expect(contrastRatio(hexToRgb("#767676"), WHITE)).toBeCloseTo(4.54, 2);
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });

  it("weights green above red above blue, as the sRGB coefficients do", () => {
    const g = relativeLuminance({ r: 0, g: 255, b: 0 });
    const r = relativeLuminance({ r: 255, g: 0, b: 0 });
    const b = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });
});

describe("oklchToRgb", () => {
  it("round-trips the achromatic ends", () => {
    expect(oklchToRgb(0, 0, 0)).toEqual(BLACK);
    expect(oklchToRgb(1, 0, 0)).toEqual(WHITE);
  });

  it("clips rather than wrapping when a channel would leave the gamut", () => {
    // Far outside sRGB. The failure this rules out is a negative channel
    // wrapping to a bright value and reading as high contrast.
    const rgb = oklchToRgb(0.5, 0.4, 200);
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});

describe("parsePalette", () => {
  it("converts Tailwind's oklch entries to the hex values it documents", () => {
    // Tailwind publishes these as the sRGB fallbacks for its v4 palette.
    // Within one unit per channel is conversion rounding, not disagreement.
    const expected: Record<string, string> = {
      "neutral-400": "#a1a1a1",
      "neutral-500": "#737373",
      "neutral-900": "#171717",
      "red-600": "#e7000b",
    };
    for (const [name, hex] of Object.entries(expected)) {
      const got = PALETTE[name];
      const want = hexToRgb(hex);
      for (const channel of ["r", "g", "b"] as const) {
        expect(Math.abs(got[channel] - want[channel]), `${name}.${channel}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("picks up the plain-hex entries alongside the oklch ones", () => {
    expect(PALETTE.white).toEqual(WHITE);
    expect(PALETTE.black).toEqual(BLACK);
  });

  it("reads a hue of `none` as achromatic rather than as NaN", () => {
    const grey = PALETTE["neutral-500"];
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });
});

describe("resolveToken", () => {
  it("returns the palette colour for an opaque token", () => {
    expect(resolveToken("neutral-500", PALETTE, WHITE)).toEqual(PALETTE["neutral-500"]);
  });

  it("composites an alpha token over the background behind it", () => {
    const half = resolveToken("black/50", PALETTE, WHITE)!;
    expect(half).toEqual(composite(BLACK, 0.5, WHITE));
    // The point of doing this at all: the class names a colour, the eye sees
    // the blend, and the blend is what has to clear the floor.
    expect(contrastRatio(half, WHITE)).toBeLessThan(contrastRatio(BLACK, WHITE));
  });

  it("returns null for a colour it cannot resolve, rather than a default", () => {
    expect(resolveToken("brand-500", PALETTE, WHITE)).toBeNull();
    expect(resolveToken("neutral-500/half", PALETTE, WHITE)).toBeNull();
  });
});
