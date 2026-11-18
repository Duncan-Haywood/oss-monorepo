/**
 * Would re-asking a pair the respondent already answered tell a fatigued
 * (random-answering) respondent from an honest one? A repeat agrees with the
 * first answer with probability q^2 + (1-q)^2, q = P(first option picked). That
 * is 1.0 for a lopsided pair and 0.5 for a coin flip, and an adaptive selector
 * mostly shows pairs close in rating, so the honest agreement rate may already
 * sit near 0.5. This measures the expected agreement on the pairs the staged
 * hybrid really shows (answers 120 to 500, 120 items, 6 seeds, from the
 * simulator's true strengths) for honest, lapse 0.2 and fully random answerers,
 * against pairs drawn uniformly and a lopsided catch pair (pA 0.97), and the repeats needed to tell honest from
 * lapse 0.2 (one-sided z test at 5% size, 80% power). Written to MEASURE_OUT.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectNextPairHybrid } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";

const seeds = Array.from({ length: 6 }, (_, i) => 9300 + i * 17);
const agree = (pA: number, lapse: number) => {
  const q = (1 - lapse) * pA + lapse / 2;
  return q * q + (1 - q) * (1 - q);
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** pA of every pair shown at answers 120..500 by the hybrid, per seed. */
function shownPA(): number[] {
  const out: number[] = [];
  for (const seed of seeds) {
    const ids: Array<[string, string]> = [];
    const r = simulate(
      (i) => {
        const pair = selectNextPairHybrid(i);
        const n = i.answeredCount ?? 0;
        if (n >= 120 && n < 500) ids.push([pair[0], pair[1]]);
        return pair;
      },
      120, 500, seed
    );
    for (const [a, b] of ids) out.push(1 / (1 + Math.exp(-2 * (r.truth.get(a)! - r.truth.get(b)!))));
  }
  return out;
}

/** pA of uniformly drawn pairs on the same strength distribution (u(-1,1)). */
function uniformPA(n: number): number[] {
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => 1 / (1 + Math.exp(-2 * ((rand() * 2 - 1) - (rand() * 2 - 1)))));
}

/** Repeats m with agreement means a0 (honest) and a1 (lapsing): one-sided 5% z test, 80% power, Bernoulli variances. */
function repeatsNeeded(a0: number, a1: number): number {
  const z = 1.645 + 0.842;
  const sd0 = Math.sqrt(a0 * (1 - a0)), sd1 = Math.sqrt(a1 * (1 - a1));
  return Math.ceil(((z * (sd0 + sd1)) / (a0 - a1)) ** 2);
}

describe("repeat-pair consistency probe", () => {
  it("measures expected agreement and the repeats needed", () => {
    const shown = shownPA();
    const uni = uniformPA(shown.length);
    const res: Record<string, Record<string, number>> = {};
    const catchPairs = shown.map(() => 0.97); // a hand-picked top-versus-bottom pair, repeated
    for (const [name, pas] of [["hybrid", shown], ["uniform", uni], ["catch97", catchPairs]] as const) {
      const a0 = mean(pas.map((p) => agree(p, 0)));
      const a2 = mean(pas.map((p) => agree(p, 0.2)));
      const a1 = mean(pas.map((p) => agree(p, 1)));
      res[name] = {
        n: pas.length,
        meanGap: Number(mean(pas.map((p) => Math.abs(p - 0.5))).toFixed(3)),
        honest: Number(a0.toFixed(3)),
        lapse20: Number(a2.toFixed(3)),
        random: Number(a1.toFixed(3)),
        repeatsVsLapse20: repeatsNeeded(a0, a2),
        repeatsVsRandom: repeatsNeeded(a0, a1),
      };
    }
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE repeat probe ${JSON.stringify(res)}\n`);
    expect(res.hybrid.honest).toBeGreaterThan(0.5);
  }, 1_800_000);
});
