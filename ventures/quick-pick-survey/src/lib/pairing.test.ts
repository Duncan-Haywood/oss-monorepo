import { describe, expect, it } from "vitest";
import { type DecidedPick, AGREEMENT_Z_PAUSE_BELOW, activeItems, admissionPaused, answerAgreement, FIRST_OPTION_FALLBACK_SHARE, HYBRID_SWITCH_ANSWERS, hybridSwitchAt, INFO_FROM_START_MAX_ITEMS, PairItem, admissionHash, admissionOrder, pairKey, sameCategoryBias, selectNextPair, selectNextPairByInformation, selectNextPairHybrid, surveyConfidence } from "./pairing";

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

describe("hybridSwitchAt: the staged selector's switch point by list length", () => {
  it("hands over at the first answer up to INFO_FROM_START_MAX_ITEMS, at 120 answers above", () => {
    expect(hybridSwitchAt(2)).toBe(0);
    expect(hybridSwitchAt(15)).toBe(0);
    expect(hybridSwitchAt(INFO_FROM_START_MAX_ITEMS)).toBe(0);
    expect(hybridSwitchAt(INFO_FROM_START_MAX_ITEMS + 1)).toBe(HYBRID_SWITCH_ANSWERS);
    expect(hybridSwitchAt(220)).toBe(HYBRID_SWITCH_ANSWERS);
  });

  const lcg = (seed: number) => { let x = seed; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); };
  const input = (n: number, answeredCount: number, seed: number) => ({
    items: items(n).map((it, i) => ({ ...it, rating: 1500 + ((i * 37) % 11) * 30, rd: 120 + ((i * 53) % 9) * 25 })),
    timesShown: new Map<string, number>(),
    recentPairKeys: new Set<string>(),
    answeredCount,
    rand: lcg(seed),
  });

  it("a 15-item list gets the information selector's pair from the first answer", () => {
    for (let s = 1; s <= 5; s++) {
      expect(selectNextPairHybrid(input(15, 0, s))).toEqual(selectNextPairByInformation(input(15, 0, s)));
    }
  });

  it("a 200-item list still gets the shipped selector's pair before 120 answers", () => {
    for (let s = 1; s <= 5; s++) {
      expect(selectNextPairHybrid(input(200, 50, s))).toEqual(selectNextPair(input(200, 50, s)));
    }
  });

  it("an explicit switchAt still wins over the length rule", () => {
    expect(selectNextPairHybrid(input(15, 0, 3), { switchAt: 120 })).toEqual(selectNextPair(input(15, 0, 3)));
  });
});

describe("admissionOrder", () => {
  it("does not follow the id order: the first stage of 100 numbered items spans the range", () => {
    const list = Array.from({ length: 100 }, (_, i) => ({ id: `item-${String(i).padStart(4, "0")}`, rating: 1500, rd: 350, category: "c", dimensions: [] }));
    const first = admissionOrder(list).slice(0, 20).map((i) => Number(i.id.slice(5)));
    // Alphabetical admission would give 0..19. A hash order reaches the top half and the bottom half.
    expect(Math.max(...first)).toBeGreaterThan(60);
    expect(first.filter((n) => n < 50).length).toBeGreaterThan(4);
    expect(first.filter((n) => n >= 50).length).toBeGreaterThan(4);
  });
  it("is stable for the same ids whatever order they arrive in", () => {
    const list = items(30);
    const a = admissionOrder(list).map((i) => i.id);
    const b = admissionOrder([...list].reverse()).map((i) => i.id);
    expect(b).toEqual(a);
    expect(admissionHash("i7")).toBe(admissionHash("i7"));
  });
});

describe("answer agreement and the admission pause", () => {
  const pick = (picked: number, other: number): DecidedPick => ({ picked, other, pickedRd: 60, otherRd: 60 });
  it("is undefined below the minimum and skips equal ratings", () => {
    expect(answerAgreement([pick(1600, 1500)])).toBeUndefined();
    expect(answerAgreement([pick(1500, 1500), pick(1500, 1500)], 1)).toBeUndefined();
  });
  it("is near zero for answers that follow the model and strongly negative for coin flips", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const honest: DecidedPick[] = [];
    const random: DecidedPick[] = [];
    for (let i = 0; i < 80; i++) {
      const d = 200 + rand() * 200;
      const pFav = 1 / (1 + Math.exp(-d / 173.7178 / Math.sqrt(1 + (3 * (85 / 173.7178) ** 2) / Math.PI ** 2)));
      honest.push(rand() < pFav ? pick(1500 + d, 1500) : pick(1500, 1500 + d));
      random.push(rand() < 0.5 ? pick(1500 + d, 1500) : pick(1500, 1500 + d));
    }
    expect(answerAgreement(honest)!).toBeGreaterThan(-2);
    expect(answerAgreement(random)!).toBeLessThan(-2);
  });
  it("pauses only below the threshold", () => {
    expect(admissionPaused(undefined)).toBe(false);
    expect(admissionPaused(AGREEMENT_Z_PAUSE_BELOW)).toBe(false);
    expect(admissionPaused(AGREEMENT_Z_PAUSE_BELOW - 0.01)).toBe(true);
  });
  it("a paused window stays at the core set plus anything already shown", () => {
    const pool = items(60);
    const outside = admissionOrder(pool)[40].id;
    const shown = new Map([[outside, 2]]);
    const grown = activeItems(pool, 400, shown, false);
    const paused = activeItems(pool, 400, shown, true);
    expect(grown.length).toBeGreaterThan(paused.length);
    expect(paused.length).toBe(15);
    expect(paused.some((i) => i.id === outside)).toBe(true);
  });
});
