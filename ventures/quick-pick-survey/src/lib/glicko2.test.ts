import { describe, expect, it } from "vitest";
import {
  applyComparison,
  confidenceInterval95,
  DEFAULT_GLICKO_STATE,
  ratingToLogit,
  updateGlicko,
  updateGlickoPeriod,
} from "./glicko2";

/**
 * The reference worked example from Glickman's own Glicko-2 paper. If the
 * implementation ever drifts, this is the test that catches it — everything
 * else in the app is downstream of these numbers being right.
 */
describe("Glicko-2 against Glickman's worked example", () => {
  it("sequential application stays in a sane range (not the published value)", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    // The paper's example is one player against three opponents in a single
    // rating period. We apply them sequentially, which is the standard
    // live-application simplification, so the result is only bounded here, not
    // equal to the published 1464.06 / 151.52 (the pinned test below checks
    // the arithmetic on a single game).
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

describe("Glicko-2 single game, pinned", () => {
  it("matches an independent Glickman-formula implementation (tau 0.5)", () => {
    // 1500/200/0.06 beats 1400/30/0.06: values computed with a separate
    // Python implementation of Glickman's 2013 paper steps 1-8.
    const next = updateGlicko(
      { rating: 1500, rd: 200, volatility: 0.06 },
      { rating: 1400, rd: 30, volatility: 0.06 },
      1,
    );
    expect(next.rating).toBeCloseTo(1563.564, 2);
    expect(next.rd).toBeCloseTo(175.4027, 2);
  });
});

describe("Glicko-2 rating period, Glickman's published example", () => {
  it("reproduces 1464.06 / 151.52 / 0.05999 (Glickman 2013, section 'Example')", () => {
    // The paper's player (1500, 200, 0.06) beats 1400/30 and loses to 1550/100
    // and 1700/300 in one period, tau 0.5. Published: r' = 1464.06,
    // RD' = 151.52, sigma' = 0.05999 (the paper rounds intermediate steps;
    // an unrounded independent implementation gives 1464.0507, 151.5165,
    // 0.0599960).
    const next = updateGlickoPeriod({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.059996, 6);
  });

  it("a one-game period equals the single-game update", () => {
    const p = { rating: 1580, rd: 120, volatility: 0.061 };
    const o = { rating: 1490, rd: 210, volatility: 0.058 };
    const a = updateGlickoPeriod(p, [{ opponent: o, score: 0.5 }]);
    const b = updateGlicko(p, o, 0.5);
    expect(a.rating).toBeCloseTo(b.rating, 10);
    expect(a.rd).toBeCloseTo(b.rd, 10);
    expect(a.volatility).toBeCloseTo(b.volatility, 12);
  });

  it("refuses an empty period", () => {
    expect(() => updateGlickoPeriod(DEFAULT_GLICKO_STATE, [])).toThrow(RangeError);
  });
});

describe("Glicko-2 single game, rating, RD and volatility pinned", () => {
  // Reference values from an independent Python implementation of Glickman's
  // steps 1-8 that reproduces the paper's example above (quality audit
  // 2026-11-10, fix round 2026-11-11). Volatility moves by about 1e-5 per
  // game, so it is pinned to 1e-7: a change to tau or the Illinois solver
  // shows up there first.
  const cases: [string, [number, number], [number, number], 0 | 0.5 | 1, [number, number, number]][] = [
    ["a draw between two new items", [1500, 350], [1500, 350], 0.5, [1500, 290.318962, 0.05999896]],
    ["a favourite losing", [1620, 80], [1450, 150], 0, [1596.904029, 79.247502, 0.06000293]],
    ["an upset win", [1300, 60], [1800, 60], 1, [1319.677458, 60.709368, 0.06001079]],
  ];
  for (const [name, [r, rd], [ro, rdo], score, [er, erd, esig]] of cases) {
    it(name, () => {
      const next = updateGlicko(
        { rating: r, rd, volatility: 0.06 },
        { rating: ro, rd: rdo, volatility: 0.06 },
        score,
      );
      expect(next.rating).toBeCloseTo(er, 3);
      expect(next.rd).toBeCloseTo(erd, 3);
      expect(next.volatility).toBeCloseTo(esig, 7);
    });
  }
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

describe("updateGlicko with a lapse term", () => {
  const player = { rating: 1560, rd: 180, volatility: 0.06 };
  const opponent = { rating: 1480, rd: 120, volatility: 0.06 };
  const SCALE = 173.7178;

  it("lapse 0 is the published update, to the last bit", () => {
    for (const s of [0, 0.5, 1] as const) {
      expect(updateGlicko(player, opponent, s, 0)).toEqual(updateGlicko(player, opponent, s));
    }
  });

  it("tends to the published update as the lapse share goes to 0", () => {
    const plain = updateGlicko(player, opponent, 1);
    const tiny = updateGlicko(player, opponent, 1, 1e-9);
    expect(tiny.rating).toBeCloseTo(plain.rating, 4);
    expect(tiny.rd).toBeCloseTo(plain.rd, 4);
  });

  it("uses the information and score of the lapse likelihood (checked by finite differences)", () => {
    // One game, volatility pinned by a huge rd so phi* ~ phi: compare the
    // closed-form step against a numeric derivative of
    // log L(mu) = s log q + (1 - s) log(1 - q), q = e/2 + (1 - e) sigmoid(g (mu - muOpp)).
    const e = 0.2;
    const mu = (player.rating - 1500) / SCALE;
    const muOpp = (opponent.rating - 1500) / SCALE;
    const phiOpp = opponent.rd / SCALE;
    const g = 1 / Math.sqrt(1 + (3 * phiOpp * phiOpp) / (Math.PI * Math.PI));
    const q = (m: number) => e / 2 + (1 - e) / (1 + Math.exp(-g * (m - muOpp)));
    const logL = (m: number) => Math.log(q(m)); // a win
    const h = 1e-5;
    const score = (logL(mu + h) - logL(mu - h)) / (2 * h);
    const p = 1 / (1 + Math.exp(-g * (mu - muOpp)));
    const dq = (1 - e) * g * p * (1 - p);
    const info = (dq * dq) / (q(mu) * (1 - q(mu)));
    const phi = player.rd / SCALE;
    const next = updateGlicko(player, opponent, 1, e);
    const newPhi = next.rd / SCALE;
    // The rating step is newPhi^2 * score; newPhi^2 = 1 / (1 / phi*^2 + info).
    expect((next.rating - player.rating) / SCALE).toBeCloseTo(newPhi * newPhi * score, 5);
    const sigma = next.volatility;
    const phiStar2 = phi * phi + sigma * sigma;
    expect(1 / (newPhi * newPhi)).toBeCloseTo(1 / phiStar2 + info, 5);
  });

  it("moves the rating less and shrinks rd less than the published update", () => {
    const plain = updateGlicko(player, opponent, 1);
    for (const e of [0.05, 0.2, 0.5]) {
      const lapsed = updateGlicko(player, opponent, 1, e);
      expect(lapsed.rating - player.rating).toBeLessThan(plain.rating - player.rating);
      expect(lapsed.rating).toBeGreaterThan(player.rating);
      expect(lapsed.rd).toBeGreaterThan(plain.rd);
      expect(lapsed.rd).toBeLessThan(player.rd);
    }
  });

  it("damps an upset more than the published update does", () => {
    const strong = { rating: 1900, rd: 60, volatility: 0.06 };
    const weak = { rating: 1200, rd: 60, volatility: 0.06 };
    const plain = updateGlicko(weak, strong, 1);
    const lapsed = updateGlicko(weak, strong, 1, 0.2);
    expect(lapsed.rating - weak.rating).toBeLessThan((plain.rating - weak.rating) / 2);
  });

  it("is symmetric and leaves equal items unmoved on a tie", () => {
    const first = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "A", 0.2);
    const second = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "B", 0.2);
    expect(first.a.rating).toBeCloseTo(second.b.rating, 6);
    const tie = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "EQUAL", 0.2);
    expect(tie.a.rating).toBeCloseTo(DEFAULT_GLICKO_STATE.rating, 6);
  });

  it("rejects a lapse share outside [0, 1)", () => {
    for (const bad of [-0.1, 1, 2, Number.NaN]) {
      expect(() => updateGlicko(player, opponent, 1, bad)).toThrow(RangeError);
    }
  });
});
