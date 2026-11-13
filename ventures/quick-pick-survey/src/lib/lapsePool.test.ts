import { describe, expect, it } from "vitest";
import { REFIT_PRIOR_PHI, sampledEvidence, type RefitAnswer } from "@/lib/btRefit";
import { beta19Weights, LAPSE_POOL_GRID, lapseEvidenceGrid, lapseMode, pooledLapseSpread, profiledPanelEvidence } from "@/lib/lapsePool";

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

/** A Bradley-Terry respondent with likes evenly spread at sd `spread`, random pairs, answering at random a share `lapse` of the time. */
function person(items: number, count: number, spread: number, seed: number, lapse = 0) {
  const rand = mulberry32(seed);
  const mu = Array.from({ length: items }, (_, i) => spread * Math.sqrt(3) * (2 * (i + 0.5) / items - 1));
  const ids = mu.map((_, i) => `i${i}`);
  const answers: RefitAnswer[] = [];
  for (let k = 0; k < count; k++) {
    const a = Math.floor(rand() * items);
    let b = Math.floor(rand() * (items - 1));
    if (b >= a) b++;
    const p = rand() < lapse ? 0.5 : 1 / (1 + Math.exp(-(mu[a] - mu[b])));
    answers.push(rand() < p ? { winner: ids[a], loser: ids[b] } : { winner: ids[b], loser: ids[a] });
  }
  return { ids, answers };
}

describe("lapseEvidenceGrid", () => {
  it("matches the plain sampled evidence at e = 0", () => {
    const p = person(8, 30, 1, 5);
    for (const phi of [0.5, 1.2, 2]) {
      const [e0] = lapseEvidenceGrid(p.ids, p.answers, phi, { grid: [0], draws: 20000 });
      expect(e0).toBeCloseTo(sampledEvidence(p.ids, p.answers, phi, { draws: 20000 }), 1);
    }
  });

  it("gives a pure coin flipper exactly n log 1/2, whatever phi", () => {
    const p = person(8, 30, 1, 5);
    for (const phi of [0.4, 2]) expect(lapseEvidenceGrid(p.ids, p.answers, phi, { grid: [1] })[0]).toBeCloseTo(30 * Math.log(0.5), 12);
  });

  it("prefers a lapse term for a coin flipper and none for an honest person", () => {
    const honest = person(8, 60, 1.5, 7);
    const flipper = person(8, 60, 1.5, 7, 1);
    const h = lapseEvidenceGrid(honest.ids, honest.answers, 1.5, { grid: [0, 0.6] });
    const f = lapseEvidenceGrid(flipper.ids, flipper.answers, 1.5, { grid: [0, 0.6] });
    expect(h[0]).toBeGreaterThan(h[1]);
    expect(f[1]).toBeGreaterThan(f[0]);
  });

  it("rejects a lapse share outside [0, 1]", () => {
    const p = person(4, 6, 1, 1);
    expect(() => lapseEvidenceGrid(p.ids, p.answers, 1, { grid: [1.2] })).toThrow(RangeError);
  });
});

describe("lapseMode", () => {
  it("shrinks the mode toward zero as the lapse share rises (each answer says less)", () => {
    const p = person(6, 40, 1.5, 3);
    const spread = (e: number) => Math.max(...lapseMode(p.ids, p.answers, 2, e).mu.map(Math.abs));
    expect(spread(0.4)).toBeLessThan(spread(0));
  });
});

describe("profiledPanelEvidence", () => {
  it("puts the weight on the grid value every person's likelihood favours", () => {
    const grids = Array.from({ length: 10 }, () => [-10, -2, -8]);
    const { weights, evidence } = profiledPanelEvidence(grids);
    expect(weights[1]).toBeGreaterThan(0.99);
    expect(evidence).toBeCloseTo(-20, 1);
  });

  it("splits the weights for a mixed panel", () => {
    const grids = [...Array.from({ length: 6 }, () => [0, -20]), ...Array.from({ length: 4 }, () => [-20, 0])];
    const { weights } = profiledPanelEvidence(grids);
    expect(weights[0]).toBeCloseTo(0.6, 2);
    expect(weights[1]).toBeCloseTo(0.4, 2);
  });
});

describe("fixed lapse weights", () => {
  it("beta19Weights is normalised, falls with e and keeps the coin flipper possible", () => {
    const w = beta19Weights();
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let k = 1; k < w.length; k++) expect(w[k]).toBeLessThanOrEqual(w[k - 1]);
    expect(w[LAPSE_POOL_GRID.indexOf(1)]).toBeGreaterThan(0);
  });

  it("profiledPanelEvidence with fixed weights uses them as given", () => {
    const grids = [[0, -20], [-20, 0]];
    const { weights, evidence } = profiledPanelEvidence(grids, { fixed: [0.9, 0.1] });
    expect(weights).toEqual([0.9, 0.1]);
    expect(evidence).toBeCloseTo(Math.log(0.9) + Math.log(0.1), 6);
    expect(() => profiledPanelEvidence(grids, { fixed: [1] })).toThrow(RangeError);
  });

  it("a shared cache gives the same answer as a fresh run", () => {
    const people = Array.from({ length: 4 }, (_, i) => person(6, 24, 1, 51 + i * 3));
    const cache = new Map<number, number[][]>();
    const a = pooledLapseSpread(people, { draws: 300, cache });
    const b = pooledLapseSpread(people, { draws: 300, cache, fixed: beta19Weights() });
    expect(pooledLapseSpread(people, { draws: 300 })).toEqual(a);
    expect(pooledLapseSpread(people, { draws: 300, fixed: beta19Weights() })).toEqual(b);
  });
});

describe("pooledLapseSpread", () => {
  it("is not dragged down by coin flippers the way a lapse-blind pool is", () => {
    // Half honest at spread 1.2, half pure coin flippers: a coin flip looks like spread 0.
    const people = Array.from({ length: 12 }, (_, i) => person(8, 40, 1.2, 101 + i * 13, i % 2 === 0 ? 0 : 1));
    const honest = people.filter((_, i) => i % 2 === 0);
    const withLapse = pooledLapseSpread(people, { draws: 500 });
    const honestOnly = pooledLapseSpread(honest, { grid: [0], draws: 500 });
    expect(Math.abs(Math.log(withLapse.phi / honestOnly.phi))).toBeLessThan(0.25);
    expect(withLapse.upper).toBeGreaterThanOrEqual(withLapse.phi);
    expect(withLapse.upper).toBeLessThanOrEqual(REFIT_PRIOR_PHI);
    // The panel's own reading: about half its weight on the top lapse shares (0.6 and 1 are hard to tell apart in 40 answers).
    const top = withLapse.weights.slice(-2).reduce((s, w) => s + w, 0);
    expect(top).toBeGreaterThan(0.35);
    expect(top).toBeLessThan(0.65);
    // The lapse-blind fit on the same panel lands lower.
    const blind = pooledLapseSpread(people, { grid: [0], draws: 500 });
    expect(blind.phi).toBeLessThan(withLapse.phi);
  });

  it("returns the ceiling for an empty panel", () => {
    expect(pooledLapseSpread([]).phi).toBe(REFIT_PRIOR_PHI);
  });
});
