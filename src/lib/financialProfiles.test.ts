import { describe, expect, it } from "vitest";
import { deltaFeatures, encodeFeatures, formatMoney, RANGES, selectFinancialPair } from "./financialProfiles";

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
