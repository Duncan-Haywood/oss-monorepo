import { describe, expect, it } from "vitest";
import { FIRST_OPTION_FALLBACK_SHARE, PairItem, pairKey, sameCategoryBias, selectNextPair, selectNextPairHybrid, surveyConfidence } from "./pairing";

function items(n: number, category = "cat"): PairItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`,
    rating: 1500,
    rd: 350,
    category,
    dimensions: [i % 2 === 0 ? "warmth" : "status"],
  }));
}

describe("pairKey", () => {
  it("is order-independent, so a pair has one identity", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});

describe("sameCategoryBias", () => {
  it("starts cross-category and ends within-category", () => {
    // Early: broad structure. Later: fine discrimination.
    expect(sameCategoryBias(0)).toBeLessThan(0.2);
    expect(sameCategoryBias(100)).toBeGreaterThan(0.7);
  });

  it("increases monotonically", () => {
    let prev = -1;
    for (let n = 0; n <= 60; n += 5) {
      const b = sameCategoryBias(n);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
});

describe("selectNextPair", () => {
  it("always returns two distinct items", () => {
    const pool = items(20);
    for (let i = 0; i < 200; i++) {
      const [a, b] = selectNextPair({
        items: pool,
        timesShown: new Map(),
        recentPairKeys: new Set(),
      });
      expect(a).not.toBe(b);
    }
  });

  it("throws rather than guessing when there aren't enough items", () => {
    expect(() =>
      selectNextPair({ items: items(1), timesShown: new Map(), recentPairKeys: new Set() })
    ).toThrow();
  });

  it("favours items it has shown least, so coverage evens out", () => {
    const pool = items(6);
    // Everything shown many times except one.
    const timesShown = new Map<string, number>(pool.map((p) => [p.id, 20]));
    timesShown.set("i3", 0);

    let neglectedPicked = 0;
    for (let i = 0; i < 300; i++) {
      const [a, b] = selectNextPair({ items: pool, timesShown, recentPairKeys: new Set() });
      if (a === "i3" || b === "i3") neglectedPicked++;
    }
    // With 6 items, uniform choice would surface it ~33% of the time.
    expect(neglectedPicked / 300).toBeGreaterThan(0.4);
  });

  it("avoids immediately repeating a pair it just showed", () => {
    const pool = items(4);
    const recent = new Set([pairKey("i0", "i1")]);
    let repeats = 0;
    for (let i = 0; i < 300; i++) {
      const [a, b] = selectNextPair({
        items: pool,
        timesShown: new Map(),
        recentPairKeys: recent,
      });
      if (pairKey(a, b) === pairKey("i0", "i1")) repeats++;
    }
    // Of 6 possible pairs, uniform would be ~17%.
    expect(repeats / 300).toBeLessThan(0.1);
  });
});

describe("surveyConfidence", () => {
  it("is low when nothing has been narrowed and high once it has", () => {
    expect(surveyConfidence([{ rd: 350 }, { rd: 350 }])).toBeLessThan(0.05);
    expect(surveyConfidence([{ rd: 50 }, { rd: 50 }])).toBeGreaterThan(0.95);
  });

  it("is zero with no items rather than NaN", () => {
    expect(surveyConfidence([])).toBe(0);
  });

  it("stays within 0..1 for out-of-range input", () => {
    expect(surveyConfidence([{ rd: 5 }])).toBeLessThanOrEqual(1);
    expect(surveyConfidence([{ rd: 9999 }])).toBeGreaterThanOrEqual(0);
  });
});

describe("selectNextPairHybrid first-option fallback", () => {
  const base = () => {
    const list = items(12).map((it, i) => ({ ...it, rating: 1500 + i * 40, rd: 60 + i * 20 }));
    return { items: list, timesShown: new Map<string, number>(), recentPairKeys: new Set<string>(), answeredCount: 200 };
  };
  const run = (firstOptionShare: number | undefined, seed: number) => {
    let x = seed;
    const rand = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
    return selectNextPairHybrid({ ...base(), firstOptionShare, rand });
  };

  it("uses the shipped selector past the switch when the first-option share is at the threshold", () => {
    for (let s = 1; s <= 5; s++) {
      expect(run(FIRST_OPTION_FALLBACK_SHARE, s)).toEqual(
        selectNextPair({ ...base(), rand: (() => { let x = s; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); })() })
      );
    }
  });

  it("uses the shipped selector when the share is as far below half as the threshold is above", () => {
    for (let s = 1; s <= 5; s++) {
      expect(run(1 - FIRST_OPTION_FALLBACK_SHARE, s)).toEqual(run(FIRST_OPTION_FALLBACK_SHARE, s));
    }
    expect(run(0.4, 3)).toEqual(run(undefined, 3));
  });

  it("keeps the information selector below the threshold or with no share", () => {
    expect(run(0.55, 3)).toEqual(run(undefined, 3));
  });
});
