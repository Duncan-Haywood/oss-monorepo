/**
 * Does a heavier-tailed (Student-t) prior make the refit's 95% pairwise
 * intervals hold at a narrower width than the Gaussian one?
 * (docs/INFORMATION-GAIN-SELECTOR.md, "A heavier-tailed prior for the pairwise
 * intervals".)
 *
 * Synthetic respondent of src/lib/infoGainSim.ts. For each list length, lapse
 * and budget, and each selector, every prior below refits the same answers:
 *
 *   fixed   Gaussian, sd 2.0 (REFIT_PRIOR_PHI): what the screen uses today
 *   g-pool  Gaussian, sd from the pooled sampled evidence of an independent
 *           panel of the same design (seeds + 100000; btRefit.ts, pooledPriorPhi)
 *   t<df>   Student-t with that df, scale from the same pooled evidence
 *   t-eb    the df in --dfs (and the Gaussian) with the highest pooled
 *           evidence at its own best scale: the family chosen from the data
 *
 * and prints, mean over respondents: 95% coverage of every pair's interval
 * (full covariance), coverage over pairs with at least one item in the true
 * top or bottom fifth ("ext", where a Gaussian over-shrinks), mean half-width
 * on the logit scale, and rank accuracy (Spearman, every item).
 *
 * --truth picks the true spread of likes, each with sd 1.155 on the logit
 * scale: uniform (the simulator's own draw, every earlier sweep), normal, or
 * laplace (double exponential: a few items far out, the case a t is for).
 *
 *   npx tsx scripts/t-prior-interval-sweep.ts [--truth uniform|normal|laplace] [--dfs 3,7] [--seeds 40] [--seed-base 1000] [--items 8,15,30] [--lapses 0,0.2] [--per-item 2,4,8] [--selectors shipped,staged] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, pooledPriorPhi, sampledEvidence, REFIT_PRIOR_PHI, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const truthKind = opt("--truth", "uniform");
const dfs = opt("--dfs", "3,7").split(",").map(Number);
const nSeeds = Number(opt("--seeds", "40"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const lapses = opt("--lapses", "0,0.2").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const selectorNames = opt("--selectors", "shipped,staged").split(",");
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r3 = (x: number) => Number(x.toFixed(3));

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

/** Standard normal quantile (Acklam's rational approximation, relative error under 1.2e-9). */
function normalQuantile(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// The simulator's truth t is on a scale where the logit difference is 2 dt, and its own draw is
// uniform on [-1, 1] (logit sd 2 / sqrt(3) = 1.155). The others reuse that draw's uniform as a
// quantile, so a seed's stream is unchanged, and match its sd.
const SD_T = 1 / Math.sqrt(3);
const TRUTH: Record<string, ((i: number, drawn: number) => number) | undefined> = {
  uniform: undefined,
  normal: (_i, drawn) => SD_T * normalQuantile(Math.min(Math.max((drawn + 1) / 2, 1e-12), 1 - 1e-12)),
  laplace: (_i, drawn) => {
    const u = (drawn + 1) / 2 - 0.5, b = SD_T / Math.SQRT2;
    return -b * Math.sign(u) * Math.log(Math.max(1 - 2 * Math.abs(u), 1e-12));
  },
};
if (!(truthKind in TRUTH)) throw new Error(`unknown --truth ${truthKind}`);
const truthFor = TRUTH[truthKind];

const run = (sel: string, items: number, budget: number, seed: number, lapse: number) => {
  const r = simulate(SELECTORS[sel], items, budget, seed, lapse, 0, 0, false, undefined, 0, undefined, truthFor);
  const ids = [...r.truth.keys()];
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  return { ids, answers, truth: ids.map((id) => 2 * r.truth.get(id)!) };
};

for (const items of itemCounts) {
  for (const lapse of lapses) {
    for (const k of perItem) {
      const cell: Record<string, unknown> = { truth: truthKind, items, lapse, perItem: k };
      for (const sel of selectorNames) {
        const panel = seeds.map((s) => run(sel, items, k * items, s + 100000, lapse));
        // Pooled scale and evidence for the Gaussian and each df, on the independent panel.
        const families = [Infinity, ...dfs].map((df) => {
          const phi = pooledPriorPhi(panel, { priorDf: df });
          const ev = panel.reduce((s, p) => s + sampledEvidence(p.ids, p.answers, phi, { priorDf: df }), 0);
          return { df, phi, ev };
        });
        const best = families.reduce((a, b) => (b.ev > a.ev ? b : a));
        const priors: { name: string; phi: number; df: number }[] = [
          { name: "fixed", phi: REFIT_PRIOR_PHI, df: Infinity },
          { name: "g-pool", phi: families[0].phi, df: Infinity },
          ...families.slice(1).map((f) => ({ name: `t${f.df}`, phi: f.phi, df: f.df })),
          { name: "t-eb", phi: best.phi, df: best.df },
        ];
        const acc: Record<string, { cov: number[]; ext: number[]; w: number[]; rank: number[] }> = Object.fromEntries(priors.map((p) => [p.name, { cov: [], ext: [], w: [], rank: [] }]));
        for (const s of seeds) {
          const { ids, answers, truth } = run(sel, items, k * items, s, lapse);
          const n = ids.length;
          const order = [...truth].sort((a, b) => a - b);
          const cut = Math.max(1, Math.round(n / 5));
          const extreme = truth.map((t) => t <= order[cut - 1] || t >= order[n - cut]);
          for (const p of priors) {
            const fit = refitRatings(ids, answers, { priorPhi: p.phi, priorDf: p.df });
            let pairs = 0, hit = 0, ePairs = 0, eHit = 0, w = 0;
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                const half = 1.96 * Math.sqrt(Math.max(0, fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]));
                const ok = Math.abs(fit.mu[i] - fit.mu[j] - (truth[i] - truth[j])) <= half;
                pairs++;
                hit += +ok;
                w += half;
                if (extreme[i] || extreme[j]) {
                  ePairs++;
                  eHit += +ok;
                }
              }
            }
            const a = acc[p.name];
            a.cov.push(hit / pairs);
            a.ext.push(eHit / ePairs);
            a.w.push(w / pairs);
            a.rank.push(spearman(truth, fit.mu));
          }
        }
        cell[sel] = {
          phi: Object.fromEntries(families.map((f) => [Number.isFinite(f.df) ? `t${f.df}` : "g", r3(f.phi)])),
          ebDf: Number.isFinite(best.df) ? best.df : "g",
          ...Object.fromEntries(priors.map((p) => [p.name, { cov: r3(mean(acc[p.name].cov)), ext: r3(mean(acc[p.name].ext)), w: r3(mean(acc[p.name].w)), rank: r3(mean(acc[p.name].rank)) }])),
        };
      }
      console.log(JSON.stringify(cell));
      if (jsonl) appendFileSync(jsonl, JSON.stringify({ seedBase, seeds: nSeeds, ...cell }) + "\n");
    }
  }
}
