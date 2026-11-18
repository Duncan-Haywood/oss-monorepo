import { describe, expect, it } from "vitest";
import { DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { estimateLapse, LAPSE_GRID, lapsePosterior, pickProbability, pooledLapsePrior, posteriorMean, type LapseAnswer } from "@/lib/lapseEstimate";

const st = (rating: number, rd = 50): GlickoState => ({ ...DEFAULT_GLICKO_STATE, rating, rd });

describe("pickProbability", () => {
  it("is one half between equal items and symmetric", () => {
    expect(pickProbability(st(1500), st(1500))).toBeCloseTo(0.5, 12);
    const p = pickProbability(st(1700), st(1500));
    expect(p).toBeGreaterThan(0.5);
    expect(pickProbability(st(1500), st(1700))).toBeCloseTo(1 - p, 12);
  });
  it("moves toward one half as rd grows", () => {
    expect(pickProbability(st(1700, 300), st(1500, 300))).toBeLessThan(pickProbability(st(1700, 30), st(1500, 30)));
  });
});

describe("lapsePosterior and estimateLapse", () => {
  it("returns the prior with no answers: Beta(1, b) mean near 1 / (1 + b), mode 0", () => {
    const post = lapsePosterior([], new Map());
    expect(post.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(estimateLapse([], new Map(), { summary: "map" })).toBe(0);
    // Grid truncated at 0.9, so the mean is a little under 1/20.
    expect(estimateLapse([], new Map())).toBeGreaterThan(0.035);
    expect(estimateLapse([], new Map())).toBeLessThan(0.05);
  });

  it("reads a high lapse share from answers that contradict confident ratings", () => {
    const answers: LapseAnswer[] = [];
    for (let i = 0; i < 40; i++) answers.push({ picked: "x", other: "y", p: i % 2 === 0 ? 0.98 : 0.02 });
    // Half the answers go against a 98% favourite: a coin flipper, e near 1 (grid top 0.9).
    expect(estimateLapse(answers, new Map(), { priorB: 1 })).toBeGreaterThan(0.8);
  });

  it("stays near 0 when every answer agrees with confident ratings", () => {
    const answers: LapseAnswer[] = Array.from({ length: 40 }, () => ({ picked: "x", other: "y", p: 0.98 }));
    expect(estimateLapse(answers, new Map(), { priorB: 1 })).toBeLessThan(0.05);
  });

  it("learns nothing from answers on even pairs (p = 1/2): the posterior is the prior", () => {
    const answers: LapseAnswer[] = Array.from({ length: 200 }, () => ({ picked: "x", other: "y", p: 0.5 }));
    const prior = lapsePosterior([], new Map(), 1);
    lapsePosterior(answers, new Map(), 1).forEach((w, k) => expect(w).toBeCloseTo(prior[k], 12));
  });

  it("scores answers without p against the current states, and skips unknown items", () => {
    const states = new Map([["a", st(1900, 30)], ["b", st(1100, 30)]]);
    const against: LapseAnswer[] = Array.from({ length: 20 }, () => ({ picked: "b", other: "a" }));
    expect(estimateLapse(against, states, { priorB: 1 })).toBeGreaterThan(0.8);
    const unknown: LapseAnswer[] = Array.from({ length: 20 }, () => ({ picked: "b", other: "zzz" }));
    expect(estimateLapse(unknown, states)).toBeCloseTo(estimateLapse([], states), 12);
  });

  it("rejects a prior weight below 1", () => {
    expect(() => lapsePosterior([], new Map(), 0.5)).toThrow(RangeError);
  });

  it("has a grid from 0 to 0.9", () => {
    expect(LAPSE_GRID[0]).toBe(0);
    expect(LAPSE_GRID[LAPSE_GRID.length - 1]).toBeCloseTo(0.9, 12);
  });
});

/** Grid log-likelihood of n anchor answers with win chance p, `wrong` of them against it. */
const anchorLL = (n: number, wrong: number, p = 0.95) =>
  LAPSE_GRID.map((e) => {
    const q = e / 2 + (1 - e) * p;
    return (n - wrong) * Math.log(q) + wrong * Math.log(1 - q);
  });
const flat = LAPSE_GRID.map(() => 0);

describe("posteriorMean", () => {
  it("is the grid mean under a flat likelihood and prior", () => {
    expect(posteriorMean(flat, flat)).toBeCloseTo(0.45, 12);
  });
  it("rises with anchor answers against the person's own clear preference", () => {
    expect(posteriorMean(anchorLL(10, 0), flat)).toBeLessThan(posteriorMean(anchorLL(10, 3), flat));
  });
  it("rejects a likelihood off the grid", () => {
    expect(() => posteriorMean([0, 0], flat)).toThrow(RangeError);
  });
});

describe("pooledLapsePrior", () => {
  it("is uniform with no respondents and sums to one", () => {
    const w = pooledLapsePrior([]);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(w[0]).toBeCloseTo(w[w.length - 1], 12);
  });
  it("puts its mass near zero for a survey of honest respondents", () => {
    const w = pooledLapsePrior(Array.from({ length: 40 }, () => anchorLL(10, 0)));
    const m = w.reduce((s, x, k) => s + x * LAPSE_GRID[k], 0);
    expect(m).toBeLessThan(0.08);
  });
  it("shrinks a person with one slip toward an honest survey, less toward a careless one", () => {
    const honest = pooledLapsePrior(Array.from({ length: 40 }, () => anchorLL(10, 0)));
    const careless = pooledLapsePrior(Array.from({ length: 40 }, () => anchorLL(10, 4)));
    const one = anchorLL(10, 1);
    const inHonest = posteriorMean(one, honest.map(Math.log));
    const inCareless = posteriorMean(one, careless.map(Math.log));
    expect(inHonest).toBeLessThan(posteriorMean(one, flat));
    expect(inCareless).toBeGreaterThan(inHonest);
  });
  it("finds the two groups of a mixed survey", () => {
    const lls = [...Array.from({ length: 30 }, () => anchorLL(40, 2)), ...Array.from({ length: 10 }, () => anchorLL(40, 11))];
    const w = pooledLapsePrior(lls);
    // Mass at or below 0.2 is about 3/4, matching the honest share.
    const low = w.reduce((s, x, k) => s + (LAPSE_GRID[k] <= 0.2 ? x : 0), 0);
    expect(low).toBeGreaterThan(0.65);
    expect(low).toBeLessThan(0.85);
  });
});
