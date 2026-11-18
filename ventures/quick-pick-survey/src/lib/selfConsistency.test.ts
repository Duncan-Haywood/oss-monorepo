import { describe, expect, it } from "vitest";
import { type RefitAnswer } from "@/lib/btRefit";
import { selfConsistency, SELF_CONSISTENCY_MIN_ANSWERS } from "@/lib/selfConsistency";

const ids = Array.from({ length: 10 }, (_, i) => `i${i}`);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` answers on random pairs: by the index order (lower index wins) with chance 1 - lapse, else a coin. */
function answers(count: number, lapse: number, seed: number): RefitAnswer[] {
  const r = rng(seed);
  const out: RefitAnswer[] = [];
  while (out.length < count) {
    const a = Math.floor(r() * ids.length), b = Math.floor(r() * ids.length);
    if (a === b) continue;
    const firstWins = r() < lapse ? r() < 0.5 : a < b;
    out.push(firstWins ? { winner: ids[a], loser: ids[b] } : { winner: ids[b], loser: ids[a] });
  }
  return out;
}

describe("selfConsistency", () => {
  it("gives no reading under the minimum number of answers", () => {
    expect(selfConsistency(ids, answers(SELF_CONSISTENCY_MIN_ANSWERS - 1, 0, 1))).toBeNull();
    expect(selfConsistency(ids, answers(SELF_CONSISTENCY_MIN_ANSWERS, 0, 1))).not.toBeNull();
  });

  it("reads a consistent taste well above a coin, and a coin at or below it", () => {
    const honest = selfConsistency(ids, answers(80, 0, 7))!;
    const coin = selfConsistency(ids, answers(80, 1, 7))!;
    expect(honest.answers).toBe(80);
    expect(honest.bitsPerAnswer).toBeGreaterThan(0.2);
    expect(honest.z).toBeGreaterThan(3);
    expect(honest.logBayesFactor).toBeGreaterThan(5);
    expect(coin.z).toBeLessThan(1);
    expect(coin.logBayesFactor).toBeLessThan(0);
    expect(coin.lapse).toBeGreaterThan(honest.lapse);
  });

  it("is blind to whose taste it is: a reversed taste reads the same as the original", () => {
    const original = answers(60, 0.1, 3);
    const reversed = original.map(({ winner, loser }) => ({ winner: ids[9 - ids.indexOf(winner)], loser: ids[9 - ids.indexOf(loser)] }));
    const a = selfConsistency(ids, original)!, b = selfConsistency(ids, reversed)!;
    expect(b.bitsPerAnswer).toBeCloseTo(a.bitsPerAnswer, 9);
    expect(b.z).toBeCloseTo(a.z, 9);
    expect(b.logBayesFactor).toBeCloseTo(a.logBayesFactor, 9);
  });

  it("scores a tie as half a win each way, which a coin also scores at log 2", () => {
    const allTies: RefitAnswer[] = answers(30, 1, 5).map((a) => ({ ...a, tie: true }));
    const out = selfConsistency(ids, allTies)!;
    // Ties pull every rating together: the refit predicts 1/2, so each held-out tie gains about nothing.
    expect(Math.abs(out.bitsPerAnswer)).toBeLessThan(0.05);
    expect(out.logBayesFactor).toBeLessThan(0.5);
  });

  it("rejects a fold count below 2", () => {
    expect(() => selfConsistency(ids, answers(30, 0, 2), { folds: 1 })).toThrow(RangeError);
  });
});
