import { describe, expect, it } from "vitest";
import { PHI_INTERVAL_DROP, pooledPriorPhi, pooledPriorPhiUpper, REFIT_PRIOR_PHI, sampledEvidence, type RefitAnswer } from "@/lib/btRefit";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Bradley-Terry respondent with likes evenly spread at sd `spread`, random pairs. */
function person(items: number, count: number, spread: number, seed: number) {
  const rand = mulberry32(seed);
  const mu = Array.from({ length: items }, (_, i) => spread * Math.sqrt(3) * (2 * (i + 0.5) / items - 1));
  const ids = mu.map((_, i) => `i${i}`);
  const answers: RefitAnswer[] = [];
  for (let k = 0; k < count; k++) {
    const a = Math.floor(rand() * items);
    let b = Math.floor(rand() * (items - 1));
    if (b >= a) b++;
    answers.push(rand() < 1 / (1 + Math.exp(-(mu[a] - mu[b]))) ? { winner: ids[a], loser: ids[b] } : { winner: ids[b], loser: ids[a] });
  }
  return { ids, answers };
}

const panel = (spread: number, n: number, count: number) => Array.from({ length: n }, (_, i) => person(8, count, spread, 31 + i * 13));
const pooled = (people: ReturnType<typeof panel>, phi: number) => people.reduce((s, p) => s + sampledEvidence(p.ids, p.answers, phi), 0);

describe("pooledPriorPhiUpper", () => {
  it("returns the same best phi as pooledPriorPhi and an upper end at or above it", () => {
    const people = panel(1, 6, 24);
    const { phi, upper } = pooledPriorPhiUpper(people);
    expect(phi).toBeCloseTo(pooledPriorPhi(people), 12);
    expect(upper).toBeGreaterThanOrEqual(phi);
    expect(upper).toBeLessThanOrEqual(REFIT_PRIOR_PHI);
  });

  it("puts the upper end where the pooled evidence has dropped by the interval's drop", () => {
    const people = panel(0.6, 8, 40);
    const { phi, upper } = pooledPriorPhiUpper(people, { bisect: 14 });
    expect(upper).toBeLessThan(REFIT_PRIOR_PHI);
    const best = pooled(people, phi);
    expect(best - pooled(people, upper)).toBeLessThanOrEqual(PHI_INTERVAL_DROP + 1e-9);
    expect(best - pooled(people, upper * 1.01)).toBeGreaterThan(PHI_INTERVAL_DROP);
  });

  it("narrows as the panel grows: more people pin the spread down", () => {
    const small = pooledPriorPhiUpper(panel(0.6, 3, 40));
    const large = pooledPriorPhiUpper(panel(0.6, 12, 40));
    expect(large.upper - large.phi).toBeLessThan(small.upper - small.phi);
  });

  it("returns the ceiling when nobody answered or the evidence never drops that far", () => {
    expect(pooledPriorPhiUpper([{ ids: ["a", "b"], answers: [] }]).upper).toBe(REFIT_PRIOR_PHI);
    const one = [{ ids: ["a", "b"], answers: [{ winner: "a", loser: "b" }] }];
    expect(pooledPriorPhiUpper(one).upper).toBe(REFIT_PRIOR_PHI);
  });
});
