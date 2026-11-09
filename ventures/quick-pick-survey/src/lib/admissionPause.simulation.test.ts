/**
 * Can answers that look random be told from honest ones well enough to pause
 * admission of new items? `answerAgreement` is the z-score of observed minus
 * model-expected picks of the favoured item over the last 80 answers, scored on
 * the ratings stored BEFORE each answer. Measured on the staged hybrid, 120
 * items, every 25th answer from 120 to 500, 6 seeds. The result is the
 * overlap of the two z distributions, written to MEASURE_OUT.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectNextPairHybrid } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";

const seeds = Array.from({ length: 6 }, (_, i) => 9100 + i * 13);

function zs(lapse: number): number[] {
  const out: number[] = [];
  for (const seed of seeds) {
    simulate(
      (i) => {
        const n = i.answeredCount ?? 0;
        if (n >= 120 && n % 25 === 0 && i.answerAgreement !== undefined) out.push(i.answerAgreement);
        return selectNextPairHybrid(i);
      },
      120, 500, seed, lapse, 0, 0, true
    );
  }
  return out;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2)));

describe("random-answer detection for the admission pause", () => {
  it("measures the z distribution for honest, lapse 0.2 and random respondents", () => {
    const res: Record<string, { n: number; mean: number; sd: number; below_minus2: number }> = {};
    for (const lapse of [0, 0.2, 1]) {
      const z = zs(lapse);
      res[`lapse${lapse}`] = {
        n: z.length,
        mean: Number(mean(z).toFixed(2)),
        sd: Number(sd(z).toFixed(2)),
        below_minus2: Number((z.filter((x) => x < -2).length / z.length).toFixed(2)),
      };
    }
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE admission pause z ${JSON.stringify(res)}\n`);
    expect(res.lapse0.n).toBeGreaterThan(0);
  }, 1_800_000);
});
