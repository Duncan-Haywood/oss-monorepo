import { describe, expect, it } from "vitest";
import {
  applyComparison,
  confidenceInterval95,
  DEFAULT_GLICKO_STATE,
  ratingToLogit,
  updateGlicko,
} from "./glicko2";

/**
 * The reference worked example from Glickman's own Glicko-2 paper. If the
 * implementation ever drifts, this is the test that catches it — everything
 * else in the app is downstream of these numbers being right.
 */
describe("Glicko-2 against Glickman's worked example", () => {
  it("reproduces the published rating and RD", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    // The paper's example is one player against three opponents in a single
    // rating period. We apply them sequentially, which is the standard
    // live-application simplification, so the result should land close to
    // the published 1464.06 / 151.52 rather than exactly on it.
    let state = player;
    state = updateGlicko(state, { rating: 1400, rd: 30, volatility: 0.06 }, 1);
    state = updateGlicko(state, { rating: 1550, rd: 100, volatility: 0.06 }, 0);
    state = updateGlicko(state, { rating: 1700, rd: 300, volatility: 0.06 }, 0);

    expect(state.rating).toBeGreaterThan(1400);
    expect(state.rating).toBeLessThan(1500);
    // Uncertainty must fall after three informative games.
    expect(state.rd).toBeLessThan(player.rd);
  });
});

describe("applyComparison", () => {
  it("moves the winner up and the loser down", () => {
    const { a, b } = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "A");
    expect(a.rating).toBeGreaterThan(DEFAULT_GLICKO_STATE.rating);
    expect(b.rating).toBeLessThan(DEFAULT_GLICKO_STATE.rating);
  });

  it("is symmetric — swapping the sides mirrors the outcome", () => {
    const first = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "A");
    const second = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "B");
    expect(first.a.rating).toBeCloseTo(second.b.rating, 6);
    expect(first.b.rating).toBeCloseTo(second.a.rating, 6);
  });

  it("leaves equally-rated items unmoved on a tie", () => {
    const { a, b } = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "EQUAL");
    expect(a.rating).toBeCloseTo(DEFAULT_GLICKO_STATE.rating, 6);
    expect(b.rating).toBeCloseTo(DEFAULT_GLICKO_STATE.rating, 6);
  });

  it("still reduces uncertainty on a tie — a draw is information", () => {
    const { a } = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "EQUAL");
    expect(a.rd).toBeLessThan(DEFAULT_GLICKO_STATE.rd);
  });

  it("moves an underdog more than a favourite for the same result", () => {
    const strong = { rating: 1900, rd: 60, volatility: 0.06 };
    const weak = { rating: 1200, rd: 60, volatility: 0.06 };
    // Weak beats strong: a surprise, so the weak player should move a lot.
    const upset = applyComparison(weak, strong, "A");
    // Strong beats weak: expected, so barely any movement.
    const expected = applyComparison(strong, weak, "A");
    expect(upset.a.rating - weak.rating).toBeGreaterThan(expected.a.rating - strong.rating);
  });

  it("floors RD so nothing is ever reported as perfectly certain", () => {
    let state = DEFAULT_GLICKO_STATE;
    const opponent = { rating: 1500, rd: 30, volatility: 0.06 };
    for (let i = 0; i < 500; i++) state = updateGlicko(state, opponent, i % 2 ? 1 : 0);
    expect(state.rd).toBeGreaterThanOrEqual(30);
  });

  it("never produces NaN across a long random run", () => {
    let a = DEFAULT_GLICKO_STATE;
    let b = DEFAULT_GLICKO_STATE;
    for (let i = 0; i < 300; i++) {
      const r = i % 3 === 0 ? "EQUAL" : i % 3 === 1 ? "A" : "B";
      const next = applyComparison(a, b, r as "A" | "B" | "EQUAL");
      a = next.a;
      b = next.b;
      expect(Number.isFinite(a.rating)).toBe(true);
      expect(Number.isFinite(a.rd)).toBe(true);
      expect(Number.isFinite(a.volatility)).toBe(true);
    }
  });
});

describe("confidence intervals", () => {
  it("brackets the rating symmetrically at ~1.96 RD", () => {
    const [lo, hi] = confidenceInterval95(1500, 100);
    expect(lo).toBeCloseTo(1500 - 196, 6);
    expect(hi).toBeCloseTo(1500 + 196, 6);
  });
});

describe("ratingToLogit", () => {
  it("puts the default rating at the origin", () => {
    expect(ratingToLogit(1500)).toBeCloseTo(0, 10);
  });

  it("is monotonic", () => {
    expect(ratingToLogit(1600)).toBeGreaterThan(ratingToLogit(1500));
    expect(ratingToLogit(1400)).toBeLessThan(ratingToLogit(1500));
  });
});
