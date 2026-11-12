import { describe, expect, it } from "vitest";
import { EB_PHI_MIN, empiricalPriorPhi, pooledPriorPhi, refitEvidence, REFIT_PRIOR_PHI, sampledEvidence, type RefitAnswer } from "@/lib/btRefit";

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

/** Answers from a Bradley-Terry respondent with true logit scores `mu`, random pairs. */
function simulateAnswers(mu: number[], count: number, seed: number): { ids: string[]; answers: RefitAnswer[] } {
  const rand = mulberry32(seed);
  const ids = mu.map((_, i) => `i${i}`);
  const answers: RefitAnswer[] = [];
  for (let k = 0; k < count; k++) {
    const a = Math.floor(rand() * mu.length);
    let b = Math.floor(rand() * (mu.length - 1));
    if (b >= a) b++;
    const aWins = rand() < 1 / (1 + Math.exp(-(mu[a] - mu[b])));
    answers.push(aWins ? { winner: ids[a], loser: ids[b] } : { winner: ids[b], loser: ids[a] });
  }
  return { ids, answers };
}

describe("refitEvidence", () => {
  it("is unchanged by items no answer names", () => {
    const answers: RefitAnswer[] = [
      { winner: "a", loser: "b" },
      { winner: "b", loser: "c" },
      { winner: "a", loser: "c" },
      { winner: "c", loser: "a", tie: true },
    ];
    for (const phi of [0.4, 1, 2]) {
      expect(refitEvidence(["a", "b", "c", "x", "y"], answers, phi)).toBeCloseTo(refitEvidence(["a", "b", "c"], answers, phi), 9);
    }
  });

  it("matches the one-pair closed form: Laplace evidence of a single win", () => {
    // Two items, one answer a > b. With d = mu_a - mu_b ~ N(0, 2 phi^2) the problem is one-dimensional
    // in d (the sum is untouched by the data), so the Laplace evidence is that of d alone.
    const phi = 0.8;
    const v = 2 * phi * phi;
    // Mode of -log1p(exp(-d)) - d^2 / (2v), by Newton.
    let d = 0;
    for (let i = 0; i < 100; i++) {
      const p = 1 / (1 + Math.exp(-d));
      d -= (1 - p - d / v) / (-(p * (1 - p)) - 1 / v);
    }
    const p = 1 / (1 + Math.exp(-d));
    const h = p * (1 - p) + 1 / v;
    const expected = -Math.log1p(Math.exp(-d)) - (d * d) / (2 * v) - 0.5 * Math.log(v) - 0.5 * Math.log(h);
    // refitEvidence drops the same constants for every phi; compare differences across two phis.
    const phi2 = 1.7, v2 = 2 * phi2 * phi2;
    let d2 = 0;
    for (let i = 0; i < 100; i++) {
      const q = 1 / (1 + Math.exp(-d2));
      d2 -= (1 - q - d2 / v2) / (-(q * (1 - q)) - 1 / v2);
    }
    const q = 1 / (1 + Math.exp(-d2));
    const expected2 = -Math.log1p(Math.exp(-d2)) - (d2 * d2) / (2 * v2) - 0.5 * Math.log(v2) - 0.5 * Math.log(q * (1 - q) + 1 / v2);
    const answers = [{ winner: "a", loser: "b" }];
    const got = refitEvidence(["a", "b"], answers, phi) - refitEvidence(["a", "b"], answers, phi2);
    expect(got).toBeCloseTo(expected - expected2, 8);
  });
});

/** log E[p^w (1 - p)^l] with p = sigmoid(d), d ~ N(0, 2 phi^2), by quadrature: the exact evidence of w wins and l losses on one pair. */
function exactPairEvidence(wins: number, losses: number, phi: number): number {
  const sd = Math.SQRT2 * phi;
  let s = 0;
  const h = 0.001;
  for (let z = -10; z <= 10; z += h) {
    const p = 1 / (1 + Math.exp(-sd * z));
    s += (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * p ** wins * (1 - p) ** losses * h;
  }
  return Math.log(s);
}

describe("sampledEvidence", () => {
  it("is exact on one answer: log 1/2 whatever the prior, by symmetry", () => {
    for (const phi of [0.3, 1, 2]) expect(sampledEvidence(["a", "b"], [{ winner: "a", loser: "b" }], phi)).toBeCloseTo(Math.log(0.5), 1);
  });

  it("matches quadrature on one pair answered several ways, where the Laplace form drifts", () => {
    const answers: RefitAnswer[] = [
      { winner: "a", loser: "b" },
      { winner: "b", loser: "a" },
      { winner: "a", loser: "b" },
      { winner: "a", loser: "b" },
    ];
    for (const phi of [0.3, 0.8, 2]) {
      const exact = exactPairEvidence(3, 1, phi);
      expect(Math.abs(sampledEvidence(["a", "b"], answers, phi, { draws: 8000 }) - exact)).toBeLessThan(0.02);
    }
  });

  it("is deterministic for a seed", () => {
    const { ids, answers } = simulateAnswers([-1, 0, 0.5, 1.2], 20, 3);
    expect(sampledEvidence(ids, answers, 0.9)).toBe(sampledEvidence(ids, answers, 0.9));
  });
});

describe("empiricalPriorPhi", () => {
  it("keeps the fixed prior when there are no answers", () => {
    expect(empiricalPriorPhi(["a", "b"], [])).toBe(REFIT_PRIOR_PHI);
  });

  it("returns the evidence's maximum over the allowed range", () => {
    const { ids, answers } = simulateAnswers([-1.2, -0.4, 0, 0.3, 0.9, 1.5], 40, 7);
    const phi = empiricalPriorPhi(ids, answers, { evidence: "laplace", steps: 24 });
    const best = refitEvidence(ids, answers, phi);
    for (let k = 0; k <= 60; k++) {
      const grid = EB_PHI_MIN * (REFIT_PRIOR_PHI / EB_PHI_MIN) ** (k / 60);
      expect(best).toBeGreaterThanOrEqual(refitEvidence(ids, answers, grid) - 1e-6);
    }
  });

  it("goes to the floor for coin-flip answers and the ceiling for a strict, repeated order", () => {
    const ids = ["a", "b", "c", "d"];
    const flips: RefitAnswer[] = [];
    for (const [x, y] of [["a", "b"], ["c", "d"], ["a", "c"], ["b", "d"]]) flips.push({ winner: x, loser: y }, { winner: y, loser: x });
    expect(empiricalPriorPhi(ids, flips)).toBeCloseTo(EB_PHI_MIN, 6);
    expect(empiricalPriorPhi(ids, flips, { evidence: "laplace" })).toBeCloseTo(EB_PHI_MIN, 6);
    const strict: RefitAnswer[] = [];
    for (let r = 0; r < 6; r++) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) strict.push({ winner: ids[i], loser: ids[j] });
    expect(empiricalPriorPhi(ids, strict)).toBeCloseTo(REFIT_PRIOR_PHI, 6);
  });

  it("recovers a person's spread of likes from plenty of answers", () => {
    // Twelve items with true scores of sd 1.0 (logit scale), 600 random-pair answers.
    const mu = [-1.6, -1.2, -0.9, -0.6, -0.3, -0.1, 0.1, 0.3, 0.6, 0.9, 1.2, 1.6];
    const sd = Math.sqrt(mu.reduce((s, m) => s + m * m, 0) / mu.length);
    for (const seed of [1, 2, 3]) {
      const { ids, answers } = simulateAnswers(mu, 600, seed);
      const phi = empiricalPriorPhi(ids, answers);
      expect(phi).toBeGreaterThan(0.75 * sd);
      expect(phi).toBeLessThan(1.3 * sd);
    }
  });

  it("pools several respondents: the shared spread from many short answer lists", () => {
    // Forty people, eight items each with their own true scores of sd about 1.0, 24 answers each:
    // too few for one person's estimate, enough together.
    const people = Array.from({ length: 40 }, (_, p) => {
      const rand = mulberry32(500 + p);
      const mu = Array.from({ length: 8 }, () => (rand() * 2 - 1) * Math.sqrt(3));
      return simulateAnswers(mu, 24, 900 + p);
    });
    const phi = pooledPriorPhi(people);
    expect(phi).toBeGreaterThan(0.75);
    expect(phi).toBeLessThan(1.3);
    expect(pooledPriorPhi([])).toBe(REFIT_PRIOR_PHI);
  });

  it("rejects a bad range", () => {
    expect(() => empiricalPriorPhi(["a"], [], { min: 0 })).toThrow(RangeError);
    expect(() => empiricalPriorPhi(["a"], [], { min: 2, max: 1 })).toThrow(RangeError);
  });
});
