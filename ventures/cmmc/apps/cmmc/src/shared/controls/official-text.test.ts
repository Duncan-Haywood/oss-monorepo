// The library must match the official text word for word. official-text.json is extracted from
// NIST SP 800-171 Rev. 2 (NIST's requirements spreadsheet), NIST SP 800-171A (June 2018),
// FAR 52.204-21(b)(1) and 32 CFR 170.24(c)(2) by scripts/extract_official_text.py.
import { describe, expect, it } from "vitest";
import { LEVEL1_REQUIREMENTS } from "./level1";
import { LEVEL2_BY_NIST_ID, LEVEL2_REQUIREMENTS } from "./level2";
import official from "./official-text.json";

describe("control library matches the official sources", () => {
  it("has the same 110 requirement numbers, in NIST order", () => {
    expect(LEVEL2_REQUIREMENTS.map((r) => r.nistId)).toEqual(official.level2.map((r) => r.nistId));
  });

  for (const o of official.level2) {
    it(`${o.nistId}: requirement, basic/derived and objectives are verbatim`, () => {
      const r = LEVEL2_BY_NIST_ID.get(o.nistId);
      expect(r).toBeDefined();
      expect(r?.text).toBe(o.text);
      expect(r?.kind).toBe(o.kind);
      expect(r?.objectives.map((x) => x.text)).toEqual(o.objectives);
    });
  }

  it("Level 1 is FAR 52.204-21(b)(1)(i)-(xv) verbatim", () => {
    expect(LEVEL1_REQUIREMENTS.map((r) => r.text)).toEqual(official.level1);
  });

  it("Level 1 objectives are SP 800-171A's with FCI for CUI (32 CFR 170.15(c)(1)(i)), 59 in all", () => {
    const byId = new Map(official.level2.map((r) => [r.nistId, r.objectives]));
    const objectives = LEVEL1_REQUIREMENTS.flatMap((r) => r.objectives);
    expect(objectives).toHaveLength(59);
    for (const r of LEVEL1_REQUIREMENTS) {
      const expected = r.nistIds.flatMap((n) =>
        (byId.get(n) ?? []).map((t) => t.replace(/\bCUI\b/g, "FCI")),
      );
      expect(r.objectives.map((o) => o.text)).toEqual(expected);
    }
    expect(objectives.filter((o) => /\bCUI\b/.test(o.text))).toEqual([]);
    expect(objectives.filter((o) => /\bFCI\b/.test(o.text)).map((o) => o.id)).toEqual([
      "3.1.22[b]",
      "3.1.22[d]",
      "3.1.22[e]",
      "3.8.3[a]",
      "3.8.3[b]",
    ]);
  });

  it("point values are those listed in 32 CFR 170.24(c)(2)(i)(B)", () => {
    const five = new Set([...official.weights.five, ...official.weights.partial]);
    const three = new Set(official.weights.three);
    const none = new Set(official.weights.noValue);
    for (const r of LEVEL2_REQUIREMENTS) {
      const expected = none.has(r.nistId)
        ? 0
        : five.has(r.nistId)
          ? 5
          : three.has(r.nistId)
            ? 3
            : 1;
      expect({ id: r.nistId, weight: r.weight }).toEqual({ id: r.nistId, weight: expected });
    }
  });
});
