import { describe, expect, it } from "vitest";
import { DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { estimateLapse, LAPSE_GRID, lapsePosterior, pickProbability, type LapseAnswer } from "@/lib/lapseEstimate";

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
