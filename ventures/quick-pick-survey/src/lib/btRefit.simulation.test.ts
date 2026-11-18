/**
 * Backs docs/INFORMATION-GAIN-SELECTOR.md, "Per-person intervals from a refit"
 * (full sweep: scripts/refit-coverage-sweep.ts). An honest respondent answering
 * the staged selector: the stored Glicko-2 rds give 95% pairwise intervals that
 * hold the true difference for about 90% of pairs; the refit's hold about 95%
 * at the same mean width, and its rank accuracy is no worse.
 */
import { describe, expect, it } from "vitest";
import { selectNextPairHybrid } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";
import { GLICKO_SCALE, ratingToLogit } from "@/lib/glicko2";
import { refitRatings } from "@/lib/btRefit";

describe("refit intervals under the staged selector", () => {
  it("restores 95% coverage that the one-game Glicko rd loses, at the same width", () => {
    let g = 0, r = 0, pairs = 0, wg = 0, wr = 0, accG = 0, accR = 0;
    const seeds = Array.from({ length: 30 }, (_, i) => 1000 + i * 7);
    for (const s of seeds) {
      const sim = simulate((i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }), 15, 60, s);
      const ids = [...sim.truth.keys()];
      const fit = refitRatings(ids, sim.history.map(({ picked, other }) => ({ winner: picked, loser: other })));
      const n = ids.length;
      const truth = ids.map((id) => 2 * sim.truth.get(id)!);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const real = truth[i] - truth[j];
          const sa = sim.states.get(ids[i])!, sb = sim.states.get(ids[j])!;
          const halfG = (1.96 * Math.hypot(sa.rd, sb.rd)) / GLICKO_SCALE;
          const halfR = 1.96 * Math.sqrt(fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]);
          g += +(Math.abs(ratingToLogit(sa.rating) - ratingToLogit(sb.rating) - real) <= halfG);
          r += +(Math.abs(fit.mu[i] - fit.mu[j] - real) <= halfR);
          wg += halfG;
          wr += halfR;
          pairs++;
        }
      }
      // Concordant-pair share as a cheap rank-accuracy proxy.
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const t = Math.sign(truth[i] - truth[j]);
        accG += +(Math.sign(sim.states.get(ids[i])!.rating - sim.states.get(ids[j])!.rating) === t);
        accR += +(Math.sign(fit.mu[i] - fit.mu[j]) === t);
      }
    }
    const covG = g / pairs, covR = r / pairs;
    console.log("MEASURE refit coverage", JSON.stringify({ covG, covR, widthG: wg / pairs, widthR: wr / pairs, accG: accG / pairs, accR: accR / pairs }));
    expect(covG).toBeLessThan(0.93);
    expect(covR).toBeGreaterThan(0.94);
    expect(wr / pairs).toBeLessThan(1.05 * (wg / pairs));
    expect(accR / pairs).toBeGreaterThanOrEqual(accG / pairs - 0.005);
  });
});
