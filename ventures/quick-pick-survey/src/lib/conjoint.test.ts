import { describe, expect, it } from "vitest";
import { ChoiceRow, fitConjointModel, Outcome, predict } from "./conjoint";

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

/** Samples an outcome from the Davidson tie model the fitter assumes. */
function sampleOutcome(d: number, nu: number, rand: () => number): Outcome {
  const eA = Math.exp(d);
  const eTie = nu * Math.exp(d / 2);
  const denom = eA + 1 + eTie;
  const r = rand();
  if (r < eA / denom) return "A";
  if (r < (eA + eTie) / denom) return "EQUAL";
  return "B";
}

function simulate(trueParams: number[], nu: number, n: number, seed: number): ChoiceRow[] {
  const rand = seeded(seed);
  const rows: ChoiceRow[] = [];
  for (let i = 0; i < n; i++) {
    const deltaX = trueParams.map(() => rand() * 2 - 1);
    const d = deltaX.reduce((sum, x, k) => sum + x * trueParams[k], 0);
    rows.push({ deltaX, outcome: sampleOutcome(d, nu, rand) });
  }
  return rows;
}

/**
 * The penalised log-likelihood at the starting point (all coefficients zero,
 * nu = 1). There d = 0 for every row, so A, B and EQUAL are each 1/3 and the
 * ridge penalty is zero — no need to reach into the module's internals.
 */
function logLikelihoodAtZero(rows: ChoiceRow[]): number {
  return rows.length * Math.log(1 / 3);
}

describe("fitConjointModel", () => {
  it("recovers known coefficients from simulated data", () => {
    const truth = [1.4, -0.9, 0.6];
    const fit = fitConjointModel(simulate(truth, 1.3, 600, 42), truth.length);

    expect(fit.converged).toBe(true);
    truth.forEach((t, i) => {
      // Within ~3 standard errors of the generating value.
      const z = Math.abs(fit.params[i] - t) / fit.se[i];
      expect(z).toBeLessThan(3);
    });
  });

  it("recovers the sign of each effect", () => {
    const truth = [2.0, -2.0];
    const fit = fitConjointModel(simulate(truth, 1.0, 500, 7), truth.length);
    expect(fit.params[0]).toBeGreaterThan(0);
    expect(fit.params[1]).toBeLessThan(0);
  });

  it("reports wider standard errors on less data", () => {
    const truth = [1.2, -0.8];
    const small = fitConjointModel(simulate(truth, 1.0, 40, 3), truth.length);
    const large = fitConjointModel(simulate(truth, 1.0, 800, 3), truth.length);
    expect(large.se[0]).toBeLessThan(small.se[0]);
  });

  it("returns a finite neutral fit with no data at all", () => {
    const fit = fitConjointModel([], 5);
    expect(fit.params).toHaveLength(5);
    expect(fit.params.every((p) => p === 0)).toBe(true);
    expect(Number.isFinite(fit.nu)).toBe(true);
  });

  it("stays finite on perfectly separable data, where an unregularised fit would diverge", () => {
    // Every observation points the same way — MLE would send the coefficient
    // to infinity; the ridge penalty is what keeps this usable.
    const rows: ChoiceRow[] = Array.from({ length: 50 }, () => ({
      deltaX: [1, 0, 0],
      outcome: "A" as Outcome,
    }));
    const fit = fitConjointModel(rows, 3);
    expect(Number.isFinite(fit.params[0])).toBe(true);
    expect(fit.params[0]).toBeGreaterThan(0);
    expect(fit.params[0]).toBeLessThan(20);
  });

  /**
   * The gradient of a summed log-likelihood grows with the number of rows,
   * so an ABSOLUTE convergence threshold gets harder to satisfy the more
   * data you have — exactly backwards. With the old fixed 1e-7 this same
   * fit reported `converged: false` while sitting on a perfectly good
   * answer, which is the kind of flag that later gets used to decide whether
   * a result is safe to show.
   */
  it("reports convergence at large samples, not just small ones", () => {
    const truth = [1.1, -0.7];
    for (const n of [50, 800, 10000]) {
      const fit = fitConjointModel(simulate(truth, 1.2, n, 11), truth.length);
      expect(fit.converged, `n=${n}`).toBe(true);
      truth.forEach((t, i) => {
        expect(Math.abs(fit.params[i] - t) / fit.se[i], `n=${n} param ${i}`).toBeLessThan(4);
      });
    }
  });

  /**
   * When no step size improves the likelihood, the direction is unusable at
   * any scale. The old code assigned the trial point anyway — stepping
   * DOWNHILL and then reporting the result as a maximum — and, because the
   * next iteration proposed the same direction, span the full 60 iterations
   * doing it. On this input it used to take 60; it now stops as soon as it
   * stops making progress, and never returns a point worse than the one it
   * started from.
   */
  it("stops instead of stepping downhill when no step size helps", () => {
    const rand = seeded(1);
    // Feature magnitudes far outside anything the app generates, with
    // outcomes that contradict each other — the fit has nowhere to go.
    const rows: ChoiceRow[] = Array.from({ length: 60 }, () => ({
      deltaX: [(rand() * 2 - 1) * 200, (rand() * 2 - 1) * 200],
      outcome: (["A", "B", "EQUAL"] as Outcome[])[Math.floor(rand() * 3)],
    }));

    const fit = fitConjointModel(rows, 2);
    expect(fit.iterations).toBeLessThan(60);
    expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    expect(fit.logLikelihood).toBeGreaterThanOrEqual(logLikelihoodAtZero(rows) - 1e-9);
  });

  it("never produces NaN on degenerate all-tie input", () => {
    const rows: ChoiceRow[] = Array.from({ length: 30 }, () => ({
      deltaX: [0, 0, 0],
      outcome: "EQUAL" as Outcome,
    }));
    const fit = fitConjointModel(rows, 3);
    expect(fit.params.every(Number.isFinite)).toBe(true);
    expect(fit.se.every(Number.isFinite)).toBe(true);
  });
});

describe("predict", () => {
  it("is a coin flip with a tie mass when the profiles are identical", () => {
    const fit = fitConjointModel(simulate([1.0, -1.0], 1.2, 400, 21), 2);
    const p = predict(fit, [0, 0]);
    expect(p.pA).toBeCloseTo(p.pB, 6);
    expect(p.pEqual).toBeGreaterThan(0);
    expect(p.pA + p.pB + p.pEqual).toBeCloseTo(1, 6);
  });

  it("is confident when one side is strongly favoured", () => {
    const fit = fitConjointModel(simulate([2.0, 0], 1.0, 400, 9), 2);
    const p = predict(fit, [3, 0]);
    expect(p.pA).toBeGreaterThan(0.8);
    expect(p.pB).toBeLessThan(0.1);
  });

  it("always returns a normalised distribution", () => {
    const fit = fitConjointModel(simulate([1.0, -0.5, 0.3], 1.1, 200, 5), 3);
    for (const dx of [[0, 0, 0], [5, -5, 5], [-9, 9, -9]]) {
      const p = predict(fit, dx);
      expect(p.pA + p.pB + p.pEqual).toBeCloseTo(1, 6);
      expect(p.dSe).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Davidson (1970) tie model, pinned", () => {
  // P(A) = e^d / Z, P(B) = 1 / Z, P(tie) = nu e^(d/2) / Z, Z = e^d + 1 + nu e^(d/2),
  // evaluated independently in Python.
  function fitWith(params: number[], nu: number) {
    const n = params.length + 1;
    return {
      params, se: params.map(() => 0), nu, nuSe: 0,
      covariance: Array.from({ length: n }, () => new Array(n).fill(0)),
      logLikelihood: 0, converged: true, iterations: 0,
    };
  }
  it("gives the published outcome probabilities", () => {
    const a = predict(fitWith([0.8], 0.5), [1]);
    expect(a.pA).toBeCloseTo(0.5603845, 6);
    expect(a.pB).toBeCloseTo(0.2517970, 6);
    expect(a.pEqual).toBeCloseTo(0.1878185, 6);
    const b = predict(fitWith([0.6, -0.3], 1.7), [-1, 2]); // d = -1.2
    expect(b.pA).toBeCloseTo(0.1348123, 6);
    expect(b.pB).toBeCloseTo(0.4475927, 6);
    expect(b.pEqual).toBeCloseTo(0.4175950, 6);
  });

  it("fits the penalised maximum-likelihood answer on a counted table", () => {
    // 12 A, 5 B, 7 ties, every row deltaX = [1]. Without the ridge the MLE is
    // closed form: beta = ln(12/5) = 0.8755, nu = 7 / sqrt(60) = 0.9037. With
    // the 0.08 ridge on beta, an independent Newton fit in Python gives
    // beta = 0.856140, nu = 0.900142.
    const rows: ChoiceRow[] = [
      ...Array.from({ length: 12 }, () => ({ deltaX: [1], outcome: "A" as Outcome })),
      ...Array.from({ length: 5 }, () => ({ deltaX: [1], outcome: "B" as Outcome })),
      ...Array.from({ length: 7 }, () => ({ deltaX: [1], outcome: "EQUAL" as Outcome })),
    ];
    const fit = fitConjointModel(rows, 1);
    expect(fit.converged).toBe(true);
    expect(fit.params[0]).toBeCloseTo(0.85614, 3);
    expect(fit.nu).toBeCloseTo(0.90014, 3);
    expect(fit.logLikelihood).toBeCloseTo(-24.81583, 3);
  });
});
