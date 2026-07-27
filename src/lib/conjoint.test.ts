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
