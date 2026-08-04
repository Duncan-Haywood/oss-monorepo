import { describe, expect, it } from "vitest";
import {
  deltaFeatures,
  describeProfiles,
  encodeFeatures,
  formatMoney,
  RANGES,
  selectFinancialPair,
} from "./financialProfiles";

/** Deterministic RNG so a failure is reproducible rather than a flake. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZERO_COVERAGE = [0, 0, 0, 0, 0];

describe("selectFinancialPair", () => {
  it("never generates a dominated pair — one side always gives something up", () => {
    const rand = seeded(7);
    for (let i = 0; i < 400; i++) {
      const { a, b } = selectFinancialPair(ZERO_COVERAGE, null, rand);
      const aBetterOn = [
        a.income >= b.income,
        a.netWorth >= b.netWorth,
        a.futurePotential >= b.futurePotential,
        a.yearsToRealize <= b.yearsToRealize,
        a.weeklyHours <= b.weeklyHours,
      ];
      // If one side were better-or-equal on everything the question would be
      // "same but one is just better", which teaches the model nothing.
      expect(aBetterOn.every(Boolean)).toBe(false);
      expect(aBetterOn.every((x) => !x)).toBe(false);
    }
  });

  it("keeps every generated value inside its declared range", () => {
    const rand = seeded(11);
    for (let i = 0; i < 400; i++) {
      const { a, b } = selectFinancialPair(ZERO_COVERAGE, null, rand);
      for (const p of [a, b]) {
        expect(p.income).toBeGreaterThanOrEqual(RANGES.income.min * 0.95);
        expect(p.income).toBeLessThanOrEqual(RANGES.income.max * 1.05);
        expect(p.netWorth).toBeGreaterThanOrEqual(RANGES.netWorth.min * 0.95);
        expect(p.netWorth).toBeLessThanOrEqual(RANGES.netWorth.max * 1.05);
        expect(p.futurePotential).toBeLessThanOrEqual(RANGES.futurePotential.max * 1.05);
        expect(p.weeklyHours).toBeGreaterThanOrEqual(RANGES.weeklyHours.min);
        expect(p.weeklyHours).toBeLessThanOrEqual(RANGES.weeklyHours.max);
        expect(p.yearsToRealize).toBeLessThanOrEqual(RANGES.yearsToRealize.max);
      }
    }
  });

  it("shows exactly two lines in the default mode", () => {
    const rand = seeded(3);
    for (let i = 0; i < 100; i++) {
      const { linesA, linesB } = selectFinancialPair(ZERO_COVERAGE, null, rand);
      expect(linesA).toHaveLength(2);
      expect(linesB).toHaveLength(2);
    }
  });

  it("shows exactly one line in single-slot mode, for conjoined cards", () => {
    const rand = seeded(5);
    for (let i = 0; i < 100; i++) {
      const { linesA, linesB } = selectFinancialPair(ZERO_COVERAGE, null, rand, 1);
      // A conjoined card already carries an identity item; a second money
      // line would make it a three-variable question.
      expect(linesA).toHaveLength(1);
      expect(linesB).toHaveLength(1);
    }
  });

  it("never claims two different payouts on one upside line", () => {
    const rand = seeded(13);
    for (let i = 0; i < 300; i++) {
      const { linesA, linesB } = selectFinancialPair(ZERO_COVERAGE, null, rand);
      for (const lines of [linesA, linesB]) {
        const upsides = lines.filter((l) => l.icon === "rocket");
        expect(upsides.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("encodeFeatures", () => {
  it("normalises the declared range into 0..1", () => {
    const low = encodeFeatures({
      income: RANGES.income.min,
      netWorth: RANGES.netWorth.min,
      futurePotential: 0,
      yearsToRealize: 0,
      weeklyHours: RANGES.weeklyHours.min,
    });
    const high = encodeFeatures({
      income: RANGES.income.max,
      netWorth: RANGES.netWorth.max,
      futurePotential: RANGES.futurePotential.max,
      yearsToRealize: RANGES.yearsToRealize.max,
      weeklyHours: RANGES.weeklyHours.max,
    });
    expect(low[0]).toBeCloseTo(0, 6);
    expect(high[0]).toBeCloseTo(1, 6);
    expect(low[1]).toBeCloseTo(0, 6);
    expect(high[1]).toBeCloseTo(1, 6);
  });

  it("treats 'no upside' as zero rather than a small upside", () => {
    const none = encodeFeatures({
      income: 300_000, netWorth: 1_000_000, futurePotential: 0, yearsToRealize: 0, weeklyHours: 40,
    });
    expect(none[2]).toBe(0);
    expect(none[3]).toBe(0);
  });

  it("produces a zero delta for identical profiles", () => {
    const p = { income: 300_000, netWorth: 1_000_000, futurePotential: 0, yearsToRealize: 0, weeklyHours: 40 };
    expect(deltaFeatures(p, p).every((d) => d === 0)).toBe(true);
  });
});

describe("formatMoney", () => {
  it("formats across magnitudes", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(250_000)).toBe("$250K");
    expect(formatMoney(1_500_000)).toBe("$1.5M");
    expect(formatMoney(12_000_000)).toBe("$12M");
  });
});

describe("describeProfiles", () => {
  /**
   * The property that matters: a trial written to the database and read back
   * has to show the same card the person was shown. Anything less and the
   * pending-question replay in `financial-trials/next` silently rewrites the
   * question under someone mid-answer.
   */
  it("reproduces the generated card exactly, over many seeds and both slot counts", () => {
    for (const slots of [1, 2] as const) {
      for (let seed = 1; seed <= 200; seed++) {
        const pair = selectFinancialPair([0, 0, 0, 0, 0], null, seeded(seed), slots);
        const rebuilt = describeProfiles(pair.a, pair.b);

        expect(rebuilt.linesA, `seed ${seed}, ${slots} slots`).toEqual(pair.linesA);
        expect(rebuilt.linesB).toEqual(pair.linesB);
        expect(rebuilt.linesA).toHaveLength(slots);
      }
    }
  });

  it("keeps each line with the side it describes", () => {
    const a = { income: 500_000, netWorth: 1_500_000, futurePotential: 0, yearsToRealize: 0, weeklyHours: 60 };
    const b = { income: 200_000, netWorth: 1_500_000, futurePotential: 0, yearsToRealize: 0, weeklyHours: 30 };
    const { linesA, linesB } = describeProfiles(a, b);

    expect(linesA.map((l) => l.text)).toEqual(["$500K/yr income", "60 hrs/week"]);
    expect(linesB.map((l) => l.text)).toEqual(["$200K/yr income", "30 hrs/week"]);
  });

  it("renders a payout as one line even when both its numbers move", () => {
    // `upside` and `timing` are separate slots but share a line. Two lines
    // here would be a card contradicting itself about the same payout.
    const a = { income: 300_000, netWorth: 1_500_000, futurePotential: 4_000_000, yearsToRealize: 3, weeklyHours: 40 };
    const b = { income: 300_000, netWorth: 1_500_000, futurePotential: 1_000_000, yearsToRealize: 12, weeklyHours: 40 };
    const { linesA, linesB } = describeProfiles(a, b);

    expect(linesA).toEqual([{ icon: "rocket", text: "$4.0M upside in 3 yrs" }]);
    expect(linesB).toEqual([{ icon: "rocket", text: "$1.0M upside in 12 yrs" }]);
  });

  it("says nothing about two sides that do not differ", () => {
    // The caller uses an empty result as "this row can no longer be shown"
    // and picks a fresh pair, rather than rendering a blank card.
    const p = { income: 300_000, netWorth: 1_500_000, futurePotential: 0, yearsToRealize: 0, weeklyHours: 40 };
    expect(describeProfiles(p, p)).toEqual({ linesA: [], linesB: [] });
  });

  it("pluralises a one-year horizon", () => {
    const a = { income: 300_000, netWorth: 1_500_000, futurePotential: 2_000_000, yearsToRealize: 1, weeklyHours: 40 };
    const b = { ...a, yearsToRealize: 5 };
    expect(describeProfiles(a, b).linesA[0].text).toBe("$2.0M upside in 1 yr");
    expect(describeProfiles(a, b).linesB[0].text).toBe("$2.0M upside in 5 yrs");
  });
});
