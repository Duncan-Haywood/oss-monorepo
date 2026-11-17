/**
 * Do the refit's 95% pairwise intervals hold when the Gaussian prior sd is the
 * upper end of the pooled evidence's likelihood interval rather than its
 * maximum? (docs/INFORMATION-GAIN-SELECTOR.md, "Why the pooled sd collapsed".)
 * Derived from scripts/t-prior-interval-sweep.ts, Gaussian priors only:
 *
 *
 *   fixed    sd 2.0 (REFIT_PRIOR_PHI): what the screen uses today
 *   g-pool   sd at the pooled sampled evidence's maximum on an independent
 *            panel of the same design (seeds + 100000; btRefit.ts, pooledPriorPhi)
 *   g-upper  the upper end of that panel's likelihood interval on phi
 *            (btRefit.ts, pooledPriorPhiUpper: evidence within 1.92 of the best)
 *
 * Prints, mean over respondents: coverage of every pair's 95% interval (full
 * covariance), mean half-width in logits, and rank accuracy (Spearman).
 *
 *   npx tsx scripts/upper-phi-interval-sweep.ts [--truth uniform|normal|laplace] [--seeds 40] [--seed-base 1000] [--items 8,15,30] [--lapses 0,0.2] [--per-item 2,4,8] [--selectors shipped,staged] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, pooledPriorPhiUpper, REFIT_PRIOR_PHI, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const truthKind = opt("--truth", "uniform");
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
        const { phi, upper } = pooledPriorPhiUpper(panel);
        const priors = [
          { name: "fixed", phi: REFIT_PRIOR_PHI },
          { name: "g-pool", phi },
          { name: "g-upper", phi: upper },
        ];
        const acc: Record<string, { cov: number[]; w: number[]; rank: number[] }> = Object.fromEntries(priors.map((p) => [p.name, { cov: [], w: [], rank: [] }]));
        for (const s of seeds) {
          const { ids, answers, truth } = run(sel, items, k * items, s, lapse);
          const n = ids.length;
          for (const p of priors) {
            const fit = refitRatings(ids, answers, { priorPhi: p.phi });
            let pairs = 0, hit = 0, w = 0;
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                const half = 1.96 * Math.sqrt(Math.max(0, fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]));
                const ok = Math.abs(fit.mu[i] - fit.mu[j] - (truth[i] - truth[j])) <= half;
                pairs++;
                hit += +ok;
                w += half;
              }
            }
            const a = acc[p.name];
            a.cov.push(hit / pairs);
            a.w.push(w / pairs);
            a.rank.push(spearman(truth, fit.mu));
          }
        }
        cell[sel] = {
          phi: r3(phi),
          upper: r3(upper),
          ...Object.fromEntries(priors.map((p) => [p.name, { cov: r3(mean(acc[p.name].cov)), w: r3(mean(acc[p.name].w)), rank: r3(mean(acc[p.name].rank)) }])),
        };
      }
      console.log(JSON.stringify(cell));
      if (jsonl) appendFileSync(jsonl, JSON.stringify({ seedBase, seeds: nSeeds, ...cell }) + "\n");
    }
  }
}
