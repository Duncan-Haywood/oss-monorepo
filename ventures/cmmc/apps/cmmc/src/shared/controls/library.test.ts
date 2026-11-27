import { describe, expect, it } from "vitest";
import {
  CONTROLS,
  FAMILIES,
  LEVEL1_REQUIREMENTS,
  LEVEL2_REQUIREMENTS,
  LIBRARY_VERIFICATION,
  MIN_SCORE,
} from "./index";

describe("control library", () => {
  it("has the 110 NIST SP 800-171 Rev. 2 requirements, unique ids", () => {
    expect(LEVEL2_REQUIREMENTS).toHaveLength(110);
    expect(new Set(LEVEL2_REQUIREMENTS.map((r) => r.id)).size).toBe(110);
  });

  it("has the 320 NIST SP 800-171A assessment objectives", () => {
    const objectives = LEVEL2_REQUIREMENTS.flatMap((r) => r.objectives);
    expect(objectives).toHaveLength(320);
    expect(new Set(objectives.map((o) => o.id)).size).toBe(320);
  });

  it("matches the per-family requirement counts of SP 800-171 Rev. 2", () => {
    const counts = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, 0]));
    for (const r of LEVEL2_REQUIREMENTS) counts[r.family] = (counts[r.family] ?? 0) + 1;
    expect(counts).toEqual({
      AC: 22,
      AT: 3,
      AU: 9,
      CM: 9,
      IA: 11,
      IR: 3,
      MA: 6,
      MP: 9,
      PS: 2,
      PE: 6,
      RA: 3,
      CA: 4,
      SC: 16,
      SI: 7,
    });
  });

  it("has 15 Level 1 requirements, one per FAR 52.204-21(b)(1) item", () => {
    expect(LEVEL1_REQUIREMENTS).toHaveLength(15);
    expect(LEVEL1_REQUIREMENTS.map((r) => r.farRef).at(-1)).toBe("(b)(1)(xv)");
    // Item (ix) covers three SP 800-171 requirements (the "17 practices" of older CMMC material).
    expect(LEVEL1_REQUIREMENTS.flatMap((r) => r.nistIds)).toHaveLength(17);
  });

  it("encodes DoD Assessment Methodology weights: 44 x 5, 14 x 3, 51 x 1, SSP unscored; min -203", () => {
    const by = (w: number) => LEVEL2_REQUIREMENTS.filter((r) => r.weight === w).length;
    expect([by(5), by(3), by(1), by(0)]).toEqual([44, 14, 51, 1]);
    expect(LEVEL2_REQUIREMENTS.find((r) => r.weight === 0)?.nistId).toBe("3.12.4");
    expect(MIN_SCORE).toBe(-203);
  });

  it("exposes both levels and keeps the verification caveat explicit", () => {
    expect(CONTROLS[1]).toHaveLength(15);
    expect(CONTROLS[2]).toHaveLength(110);
    expect(typeof LIBRARY_VERIFICATION.verifiedAgainstOfficialText).toBe("boolean");
  });
});
