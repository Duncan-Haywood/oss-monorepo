import { describe, expect, it } from "vitest";
import { differenceSd, refitRatings, REFIT_PRIOR_PHI, type RefitAnswer } from "@/lib/btRefit";

const ids = ["a", "b", "c", "d"];

/** Log posterior on the internal scale, written out independently of the module. */
function logPost(mu: number[], answers: RefitAnswer[]): number {
  const at = (id: string) => mu[ids.indexOf(id)];
  let s = mu.reduce((acc, m) => acc - (0.5 * m * m) / (REFIT_PRIOR_PHI * REFIT_PRIOR_PHI), 0);
  for (const { winner, loser, tie } of answers) {
    const d = at(winner) - at(loser);
    const w = tie ? 0.5 : 1;
    s += w * -Math.log1p(Math.exp(-d)) + (1 - w) * -Math.log1p(Math.exp(d));
  }
  return s;
}

describe("refitRatings", () => {
  it("returns the prior (1500, rd 350) for items in no answer", () => {
    const fit = refitRatings(ids, []);
    for (const id of ids) {
      expect(fit.rating.get(id)).toBeCloseTo(1500, 9);
      expect(fit.rd.get(id)).toBeCloseTo(350, 9);
    }
  });

  it("finds the mode: the log posterior's finite-difference gradient is zero there", () => {
    const answers: RefitAnswer[] = [
      { winner: "a", loser: "b" },
      { winner: "a", loser: "c" },
      { winner: "b", loser: "c" },
      { winner: "c", loser: "b" },
      { winner: "d", loser: "a" },
      { winner: "b", loser: "d", tie: true },
    ];
    const fit = refitRatings(ids, answers);
    const h = 1e-5;
    for (let i = 0; i < ids.length; i++) {
      const up = [...fit.mu], dn = [...fit.mu];
      up[i] += h;
      dn[i] -= h;
      expect((logPost(up, answers) - logPost(dn, answers)) / (2 * h)).toBeCloseTo(0, 6);
    }
  });

  it("returns the inverse of the finite-difference negative Hessian as the covariance", () => {
    const answers: RefitAnswer[] = [
      { winner: "a", loser: "b" },
      { winner: "b", loser: "c" },
      { winner: "a", loser: "c" },
      { winner: "c", loser: "d" },
    ];
    const fit = refitRatings(ids, answers);
    const n = ids.length, h = 1e-4;
    // H_ij by central differences, then check cov * (-H) = I.
    const hess: number[][] = [];
    for (let i = 0; i < n; i++) {
      hess.push([]);
      for (let j = 0; j < n; j++) {
        const f = (di: number, dj: number) => {
          const m = [...fit.mu];
          m[i] += di;
          m[j] += dj;
          return logPost(m, answers);
        };
        hess[i].push((f(h, h) - f(h, -h) - f(-h, h) + f(-h, -h)) / (4 * h * h));
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += fit.cov[i * n + k] * -hess[k][j];
        expect(s).toBeCloseTo(i === j ? 1 : 0, 4);
      }
    }
  });

  it("orders a winner above a loser symmetrically and narrows only the items answered about", () => {
    const fit = refitRatings(ids, [{ winner: "a", loser: "b" }]);
    expect(fit.rating.get("a")! - 1500).toBeCloseTo(1500 - fit.rating.get("b")!, 9);
    expect(fit.rating.get("a")!).toBeGreaterThan(1500);
    expect(fit.rd.get("a")!).toBeLessThan(350);
    expect(fit.rd.get("c")!).toBeCloseTo(350, 9);
  });

  it("knows a directly compared pair's difference better than two independent rds say", () => {
    const answers: RefitAnswer[] = Array.from({ length: 6 }, (_, k) => (k % 3 === 0 ? { winner: "b", loser: "a" } : { winner: "a", loser: "b" }));
    const fit = refitRatings(ids, answers);
    const independent = Math.hypot(fit.rd.get("a")!, fit.rd.get("b")!) / 173.7178;
    expect(differenceSd(fit, "a", "b")).toBeLessThan(0.8 * independent);
  });

  it("pulls two items together on a tie, as Glicko-2's score of 0.5 does", () => {
    const base: RefitAnswer[] = [{ winner: "a", loser: "b" }, { winner: "a", loser: "b" }];
    const gap = (f: ReturnType<typeof refitRatings>) => f.rating.get("a")! - f.rating.get("b")!;
    const without = refitRatings(ids, base);
    const withTie = refitRatings(ids, [...base, { winner: "a", loser: "b", tie: true }]);
    expect(gap(withTie)).toBeLessThan(gap(without));
    expect(gap(withTie)).toBeGreaterThan(0);
    // A tie is symmetric: which item is named first does not matter.
    const flipped = refitRatings(ids, [...base, { winner: "b", loser: "a", tie: true }]);
    expect(gap(flipped)).toBeCloseTo(gap(withTie), 9);
  });

  it("stays finite when one item wins every answer (the prior keeps the mode bounded)", () => {
    const answers = Array.from({ length: 40 }, () => ({ winner: "a", loser: "b" }));
    const fit = refitRatings(ids, answers);
    expect(Number.isFinite(fit.rating.get("a")!)).toBe(true);
    expect(fit.rating.get("a")!).toBeGreaterThan(1700);
  });

  it("rejects an answer naming an unknown item, a self-comparison and repeated ids", () => {
    expect(() => refitRatings(ids, [{ winner: "a", loser: "z" }])).toThrow(/outside the list: z/);
    expect(() => refitRatings(ids, [{ winner: "a", loser: "a" }])).toThrow(RangeError);
    expect(() => refitRatings(["a", "a"], [])).toThrow(RangeError);
  });
});
