import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSPECTIVE,
  PERSPECTIVES,
  PERSPECTIVE_META,
  PERSPECTIVE_ORDER,
  parsePerspective,
  perspectiveOrDefault,
} from "@/lib/perspective";

describe("perspective parsing", () => {
  it("accepts every declared perspective", () => {
    for (const p of PERSPECTIVES) expect(parsePerspective(p)).toBe(p);
  });

  /**
   * The regression this exists for: /api/session/start used to narrow with
   * `body.perspective === "SELF" ? "SELF" : "PARTNER"`, so every session
   * started as "what I think my partner wants" was recorded as "what I want
   * in a partner". That both polluted the person's own PARTNER ranking and
   * left the blind-spots comparison — the sharpest couples output — with no
   * data it could ever be built from.
   */
  it("does not collapse PARTNER_GUESS into PARTNER", () => {
    expect(parsePerspective("PARTNER_GUESS")).toBe("PARTNER_GUESS");
    expect(perspectiveOrDefault("PARTNER_GUESS")).toBe("PARTNER_GUESS");
  });

  it("rejects anything that is not a perspective", () => {
    for (const bad of [null, undefined, 42, {}, [], "", "self", "PARTNER ", "OTHER"]) {
      expect(parsePerspective(bad)).toBeNull();
    }
  });

  it("falls back to the default for unusable input", () => {
    expect(perspectiveOrDefault("nonsense")).toBe(DEFAULT_PERSPECTIVE);
    expect(perspectiveOrDefault(undefined)).toBe(DEFAULT_PERSPECTIVE);
  });
});

describe("perspective presentation", () => {
  it("describes every perspective exactly once, in a stable order", () => {
    expect([...PERSPECTIVE_ORDER].sort()).toEqual([...PERSPECTIVES].sort());
    expect(new Set(PERSPECTIVE_ORDER).size).toBe(PERSPECTIVE_ORDER.length);
  });

  it("gives every perspective the copy the UI needs", () => {
    for (const p of PERSPECTIVES) {
      const meta = PERSPECTIVE_META[p];
      expect(meta.key).toBe(p);
      for (const field of ["glyph", "short", "label", "blurb", "cta"] as const) {
        expect(meta[field].length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the calls to action distinguishable from each other", () => {
    const ctas = PERSPECTIVES.map((p) => PERSPECTIVE_META[p].cta);
    expect(new Set(ctas).size).toBe(ctas.length);
  });
});
