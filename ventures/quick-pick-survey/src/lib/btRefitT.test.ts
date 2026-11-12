import { describe, expect, it } from "vitest";
import { pooledPriorPhi, priorLogDensity, refitRatings, sampledEvidence, type RefitAnswer } from "@/lib/btRefit";

// The Student-t prior option of the refit (docs/INFORMATION-GAIN-SELECTOR.md,
// "A heavier-tailed prior for the pairwise intervals"). Each check is against
// something written out here, not against the module's own arithmetic.

const ids = ["a", "b", "c", "d"];
const answers: RefitAnswer[] = [
  { winner: "a", loser: "b" },
  { winner: "a", loser: "c" },
  { winner: "a", loser: "d" },
  { winner: "a", loser: "b" },
  { winner: "a", loser: "c" },
  { winner: "b", loser: "c" },
  { winner: "c", loser: "b" },
  { winner: "d", loser: "c", tie: true },
];

/** Student-t log density written out from the textbook form, via the Gamma ratio for integer df. */
function tLogDensity(m: number, s: number, df: number): number {
  // df = 3: Gamma(2) / Gamma(1.5) = 1 / (sqrt(pi) / 2).
  if (df !== 3) throw new Error("test helper covers df = 3");
  const c = Math.log(2 / Math.sqrt(Math.PI)) - 0.5 * Math.log(3 * Math.PI) - Math.log(s);
  return c - 2 * Math.log1p((m * m) / (3 * s * s));
}

function logPost(mu: number[], s: number, df: number): number {
  const at = (id: string) => mu[ids.indexOf(id)];
  let v = mu.reduce((acc, m) => acc + tLogDensity(m, s, df), 0);
  for (const { winner, loser, tie } of answers) {
    const d = at(winner) - at(loser);
    const w = tie ? 0.5 : 1;
    v += w * -Math.log1p(Math.exp(-d)) + (1 - w) * -Math.log1p(Math.exp(d));
  }
  return v;
}

describe("priorLogDensity", () => {
  it("matches the closed-form t density at df = 3 and the normal density at df = Infinity", () => {
    for (const m of [-3, -0.4, 0, 1.1, 5]) {
      expect(priorLogDensity(m, { scale: 0.8, df: 3 })).toBeCloseTo(tLogDensity(m, 0.8, 3), 10);
      expect(priorLogDensity(m, { scale: 0.8, df: Infinity })).toBeCloseTo(-0.5 * (m / 0.8) ** 2 - Math.log(0.8 * Math.sqrt(2 * Math.PI)), 12);
    }
  });

  it("integrates to 1 for df 1, 2.5 and 7 (trapezoid on a wide grid; df 1's tails are cut off at +-4000)", () => {
    for (const [df, lim, tol] of [[1, 4000, 2e-4], [2.5, 400, 1e-3], [7, 60, 1e-6]] as const) {
      const steps = 400000, h = (2 * lim) / steps;
      let s = 0;
      for (let k = 0; k <= steps; k++) {
        const x = -lim + k * h;
        s += (k === 0 || k === steps ? 0.5 : 1) * Math.exp(priorLogDensity(x, { scale: 0.9, df }));
      }
      expect(Math.abs(s * h - 1)).toBeLessThan(tol);
    }
  });

  it("approaches the normal density as df grows", () => {
    const d = Math.abs(priorLogDensity(1.3, { scale: 1, df: 1e7 }) - priorLogDensity(1.3, { scale: 1, df: Infinity }));
    expect(d).toBeLessThan(1e-6);
  });
});

describe("refitRatings with a t prior", () => {
  it("finds the mode: the written-out log posterior's finite-difference gradient is zero there", () => {
    for (const [s, df] of [[1, 3], [0.5, 3]] as const) {
      const fit = refitRatings(ids, answers, { priorPhi: s, priorDf: df });
      const h = 1e-5;
      for (let i = 0; i < ids.length; i++) {
        const up = [...fit.mu], dn = [...fit.mu];
        up[i] += h;
        dn[i] -= h;
        expect((logPost(up, s, df) - logPost(dn, s, df)) / (2 * h)).toBeCloseTo(0, 6);
      }
    }
  });

  it("returns the inverse of the finite-difference negative Hessian (true curvature, not the majoriser) as the covariance", () => {
    const s = 1, df = 3;
    const fit = refitRatings(ids, answers, { priorPhi: s, priorDf: df });
    const n = ids.length, h = 1e-4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // (cov * -H)_ij should be the identity.
        let acc = 0;
        for (let k = 0; k < n; k++) {
          const f = (dk: number, dj: number) => {
            const x = [...fit.mu];
            x[k] += dk;
            x[j] += dj;
            return logPost(x, s, df);
          };
          const hkj = (f(h, h) - f(h, -h) - f(-h, h) + f(-h, -h)) / (4 * h * h);
          acc += fit.cov[i * n + k] * -hkj;
        }
        expect(acc).toBeCloseTo(i === j ? 1 : 0, 4);
      }
    }
  });

  it("pulls the most-preferred item toward the middle less than a Gaussian of the same scale does", () => {
    const g = refitRatings(ids, answers, { priorPhi: 0.7 });
    const t = refitRatings(ids, answers, { priorPhi: 0.7, priorDf: 3 });
    expect(t.mu[0]).toBeGreaterThan(g.mu[0]);
  });

  it("matches the Gaussian refit when df is huge", () => {
    const g = refitRatings(ids, answers, { priorPhi: 1.2 });
    const t = refitRatings(ids, answers, { priorPhi: 1.2, priorDf: 1e8 });
    for (let i = 0; i < ids.length; i++) expect(t.mu[i]).toBeCloseTo(g.mu[i], 6);
  });

  it("stays defined for a far-out item with a heavy prior (Cauchy, five straight wins)", () => {
    const five: RefitAnswer[] = Array.from({ length: 5 }, () => ({ winner: "a", loser: "b" }));
    const fit = refitRatings(["a", "b"], five, { priorPhi: 0.3, priorDf: 1 });
    expect(Number.isFinite(fit.mu[0])).toBe(true);
    expect(fit.cov[0]).toBeGreaterThan(0);
  });

  it("rejects a non-positive df", () => {
    expect(() => refitRatings(ids, answers, { priorDf: 0 })).toThrow(RangeError);
    expect(() => refitRatings(ids, answers, { priorDf: -2 })).toThrow(RangeError);
  });
});

describe("sampledEvidence with a t prior", () => {
  it("is exactly log 1/2 for one answer, for any scale (by symmetry)", () => {
    for (const s of [0.4, 1, 2]) expect(sampledEvidence(["a", "b"], [{ winner: "a", loser: "b" }], s, { priorDf: 3, draws: 4000 })).toBeCloseTo(Math.log(0.5), 1);
  });

  it("matches two-dimensional quadrature on one pair answered four ways", () => {
    const four: RefitAnswer[] = [
      { winner: "a", loser: "b" },
      { winner: "a", loser: "b" },
      { winner: "b", loser: "a" },
      { winner: "a", loser: "b", tie: true },
    ];
    const s = 0.8, df = 3;
    const lim = 25, steps = 1000, h = (2 * lim) / steps;
    let z = 0;
    for (let i = 0; i <= steps; i++) {
      const x = -lim + i * h;
      for (let j = 0; j <= steps; j++) {
        const y = -lim + j * h;
        const p = 1 / (1 + Math.exp(-(x - y)));
        const lik = p ** 2.5 * (1 - p) ** 1.5; // a: two wins and half a tie; b: one win and half a tie
        z += lik * Math.exp(tLogDensity(x, s, df) + tLogDensity(y, s, df));
      }
    }
    const exact = Math.log(z * h * h);
    expect(sampledEvidence(["a", "b"], four, s, { priorDf: df, draws: 20000 })).toBeCloseTo(exact, 1);
  });

  it("pooledPriorPhi refuses the Laplace evidence with a t prior rather than mixing families", () => {
    expect(() => pooledPriorPhi([{ ids, answers }], { evidence: "laplace", priorDf: 3 })).toThrow(RangeError);
  });
});
