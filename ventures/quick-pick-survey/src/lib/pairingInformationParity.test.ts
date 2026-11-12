/**
 * Pins selectNextPairByInformation's precomputed pair loop (2026-11-12 perf
 * change) to the per-pair form it replaced: same pair, and the same number of
 * rand() draws, on random pools with recent keys, dimensions, coverage and
 * conflict weights, and pools over the cap.
 */
import { describe, expect, it } from "vitest";
import {
  activeItems,
  admissionPaused,
  capPool,
  expectedVarianceReduction,
  INFO_POOL_CAP,
  pairKey,
  selectNextPairByInformation,
  type InformationOptions,
  type PairItem,
  type PairingInput,
} from "./pairing";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The loop as it stood before the change, kept verbatim as the reference. */
function reference(
  { items, timesShown, recentPairKeys, answeredCount = 0, answerAgreement: agreement, rand = Math.random }: PairingInput,
  { conflictBonus = 1, coverageWeight = 0, poolCap = INFO_POOL_CAP }: InformationOptions = {}
): [string, string] {
  const pool = capPool(activeItems(items, answeredCount, timesShown, admissionPaused(agreement)), timesShown, poolCap);
  const avgShown = pool.reduce((sum, i) => sum + (timesShown.get(i.id) ?? 0), 0) / pool.length;
  const lag = (i: PairItem) => Math.max(0, avgShown - (timesShown.get(i.id) ?? 0));
  let best: [string, string] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const repeatPenalty = recentPairKeys.has(pairKey(pool[i].id, pool[j].id)) ? 0.05 : 1;
      const da = pool[i].dimensions?.[0];
      const db = pool[j].dimensions?.[0];
      const conflict = da && db && da !== db ? conflictBonus : 1;
      const coverage = 1 + coverageWeight * (lag(pool[i]) + lag(pool[j]));
      const score =
        expectedVarianceReduction(pool[i], pool[j]) * repeatPenalty * conflict * coverage * (1 + rand() * 1e-6);
      if (score > bestScore) {
        bestScore = score;
        best = [pool[i].id, pool[j].id];
      }
    }
  }
  return best!;
}

function randomInput(seed: number, count: number): PairingInput {
  const r = mulberry32(seed);
  const items: PairItem[] = [];
  const timesShown = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const id = `item-${i}`;
    // Coarse ratings and rds make exact ties common, so the rand() tie-breaker decides.
    items.push({
      id,
      rating: 1500 + Math.round((r() - 0.5) * 8) * 50,
      rd: 30 + Math.round(r() * 4) * 80,
      category: `c${i % 3}`,
      dimensions: r() < 0.2 ? [] : [`d${i % 4}`],
    });
    if (r() < 0.7) timesShown.set(id, Math.floor(r() * 6));
  }
  const recentPairKeys = new Set<string>();
  for (let k = 0; k < 10; k++) {
    const a = items[Math.floor(r() * count)].id;
    const b = items[Math.floor(r() * count)].id;
    if (a !== b) recentPairKeys.add(pairKey(a, b));
  }
  return { items, timesShown, recentPairKeys, answeredCount: Math.floor(r() * 400) };
}

describe("selectNextPairByInformation matches the per-pair form", () => {
  const options: InformationOptions[] = [{}, { conflictBonus: 1.5 }, { coverageWeight: 0.3 }, { conflictBonus: 1.5, coverageWeight: 0.1, poolCap: 12 }];
  for (const count of [2, 3, 9, 40, 130]) {
    it(`${count} items`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        for (const opts of options) {
          const input = randomInput(seed * 31 + count, count);
          const ra = mulberry32(seed), rb = mulberry32(seed);
          expect(selectNextPairByInformation({ ...input, rand: ra }, opts)).toEqual(reference({ ...input, rand: rb }, opts));
          // Same number of draws: the next value from each stream agrees.
          expect(ra()).toBe(rb());
          // Again with the winner marked recent, so the repeat penalty decides.
          const won = reference({ ...input, rand: mulberry32(seed) }, opts);
          const again = { ...input, recentPairKeys: new Set([...input.recentPairKeys, pairKey(...won)]) };
          expect(selectNextPairByInformation({ ...again, rand: mulberry32(seed) }, opts)).toEqual(reference({ ...again, rand: mulberry32(seed) }, opts));
        }
      }
    });
  }

  it("a recent pair's score is cut to 0.05", () => {
    // x0-x1 scores best; x2, far off in rating, scores about 0.08 of it at
    // +1100 and 0.038 at +1300, so the penalty must sit between the two.
    const pick = (offset: number) => {
      const items: PairItem[] = [
        { id: "x0", rating: 1500, rd: 350 },
        { id: "x1", rating: 1500, rd: 350 },
        { id: "x2", rating: 1500 + offset, rd: 350 },
      ];
      const input = { items, timesShown: new Map<string, number>(), recentPairKeys: new Set([pairKey("x0", "x1")]), rand: () => 0 };
      expect(selectNextPairByInformation(input)).toEqual(reference(input));
      return selectNextPairByInformation(input);
    };
    expect(pick(1100)).toEqual(["x0", "x2"]);
    expect(pick(1300)).toEqual(["x0", "x1"]);
  });
});
