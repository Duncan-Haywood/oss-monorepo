/**
 * Can the upper end of the pooled prior sd's likelihood interval
 * (btRefit.ts, pooledPriorPhiUpper) be used for the pairwise intervals of the
 * respondents a lapse estimate calls honest, while everyone else keeps the
 * fixed prior? (docs/INFORMATION-GAIN-SELECTOR.md, "Gating the upper end on a
 * lapse estimate".) The 2026-11-13 sweep (scripts/upper-phi-interval-sweep.ts)
 * measured honest and careless panels separately; a real survey mixes them,
 * and careless answers pull the pooled evidence toward a narrower prior.
 *
 * Each cell builds a panel of 40 (the pool, seeds + 100000) and 40 target
 * respondents, both with a share `--careless` answering at random a share
 * `--careless-lapse` of the time (the first round(share x 40) of each are
 * careless). Priors for a target's pairwise 95% intervals:
 *
 *   fixed        sd 2.0 for everyone (what the screen uses today)
 *   upper-all    the upper end pooled over the whole panel, for everyone
 *   gate-beta    the upper end pooled over the panel members the lapse
 *                estimate calls honest, for targets it calls honest; fixed
 *                for the rest (estimate under the shipped Beta(1, 19) prior)
 *   gate-pooled  the same with the estimate under the survey's own lapse
 *                distribution, fitted on the panel (pooledLapsePrior)
 *   gate-oracle  the same with the true labels (the ceiling a classifier
 *                could reach)
 *
 * The lapse estimate is lapseEstimate.ts's grid posterior mean with each
 * answer's chance read in-sample from the person's own
 * fixed-prior refit: the picked item's win chance with the pairwise sd folded
 * in through Glicko's g. "Honest" is a posterior mean under `--gate`.
 *
 * Prints, per cell and selector: coverage of every pair's 95% interval (mean
 * over honest targets, over careless targets, and over all) and mean
 * half-width in logits, for each prior; the pooled upper ends; and the
 * classifier's honest-kept and careless-caught shares.
 *
 *   npx tsx scripts/upper-phi-gate-sweep.ts [--seeds 40] [--seed-base 1000] [--items 8,15,30] [--per-item 2,4,8] [--careless 0.25,0.5] [--careless-lapse 0.2] [--gate 0.1] [--selectors shipped,staged] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, pooledPriorPhiUpper, REFIT_PRIOR_PHI, type RefitAnswer, type RefitResult } from "../src/lib/btRefit";
import { DEFAULT_PRIOR_B, LAPSE_GRID, lapsePosterior, pooledLapsePrior, posteriorMean } from "../src/lib/lapseEstimate";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "40"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const carelessShares = opt("--careless", "0.25,0.5").split(",").map(Number);
const carelessLapse = Number(opt("--careless-lapse", "0.2"));
const gate = Number(opt("--gate", "0.1"));
const selectorNames = opt("--selectors", "shipped,staged").split(",");
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const r3 = (x: number) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

type Person = { ids: string[]; answers: RefitAnswer[]; truth: number[]; careless: boolean };

const run = (sel: string, items: number, budget: number, seed: number, careless: boolean): Person => {
  const r = simulate(SELECTORS[sel], items, budget, seed, careless ? carelessLapse : 0);
  const ids = [...r.truth.keys()];
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  return { ids, answers, truth: ids.map((id) => 2 * r.truth.get(id)!), careless };
};

/** Glicko's g: shrinks a logit gap by the uncertainty of the difference. */
const g = (sd: number) => 1 / Math.sqrt(1 + (3 * sd * sd) / (Math.PI * Math.PI));

/** One person's lapse log-likelihood over LAPSE_GRID, each answer's chance read in-sample from their fixed-prior refit. */
function inSampleLapseLogLik(p: { ids: readonly string[]; answers: readonly RefitAnswer[] }, fit: RefitResult): number[] {
  const n = fit.ids.length;
  const at = new Map(fit.ids.map((id, i) => [id, i]));
  const lapseAnswers = p.answers.map((a) => {
    const i = at.get(a.winner)!, j = at.get(a.loser)!;
    const sd = Math.sqrt(Math.max(0, fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]));
    return { picked: a.winner, other: a.loser, p: 1 / (1 + Math.exp(-g(sd) * (fit.mu[i] - fit.mu[j]))) };
  });
  // A flat prior (b = 1) makes the normalised posterior the likelihood up to a constant.
  return lapsePosterior(lapseAnswers, new Map(), 1).map((w) => Math.log(w));
}

const BETA_LOG_PRIOR = LAPSE_GRID.map((e) => (DEFAULT_PRIOR_B - 1) * Math.log1p(-e));

/** Share of a person's pairs whose 95% interval covers the true gap, and the mean half-width. */
function pairCoverage(p: Person, priorPhi: number): { cov: number; w: number } {
  const fit = refitRatings(p.ids, p.answers, { priorPhi });
  const n = p.ids.length;
  let pairs = 0, hit = 0, w = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const half = 1.96 * Math.sqrt(Math.max(0, fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]));
      pairs++;
      hit += +(Math.abs(fit.mu[i] - fit.mu[j] - (p.truth[i] - p.truth[j])) <= half);
      w += half;
    }
  }
  return { cov: hit / pairs, w: w / pairs };
}

const lapseLogLik = (p: Person) => inSampleLapseLogLik(p, refitRatings(p.ids, p.answers));

/** Chance a random careless person's estimate exceeds a random honest one's (ties count half). */
function auc(honest: number[], careless: number[]): number {
  if (!honest.length || !careless.length) return NaN;
  let s = 0;
  for (const c of careless) for (const h of honest) s += c > h ? 1 : c === h ? 0.5 : 0;
  return s / (honest.length * careless.length);
}

for (const share of carelessShares) {
  const nCareless = Math.round(share * nSeeds);
  for (const items of itemCounts) {
    for (const k of perItem) {
      const cell: Record<string, unknown> = { items, perItem: k, careless: share, carelessLapse, gate };
      for (const sel of selectorNames) {
        const panel = seeds.map((s, i) => run(sel, items, k * items, s + 100000, i < nCareless));
        const targets = seeds.map((s, i) => run(sel, items, k * items, s, i < nCareless));
        const panelLL = panel.map(lapseLogLik);
        const targetLL = targets.map(lapseLogLik);
        // Two classifiers: the shipped Beta(1, 19) prior, and the survey's own lapse distribution
        // fitted on the panel (pooledLapsePrior), as a stored survey value would be.
        const pooledLog = pooledLapsePrior(panelLL).map((w) => Math.log(w));
        const classifiers = { beta: BETA_LOG_PRIOR, pooled: pooledLog };
        const est = Object.fromEntries(
          Object.entries(classifiers).map(([name, prior]) => {
            const panelE = panelLL.map((ll) => posteriorMean(ll, prior));
            const targetE = targetLL.map((ll) => posteriorMean(ll, prior));
            const panelFlag = panelE.map((e) => e < gate);
            const targetFlag = targetE.map((e) => e < gate);
            return [name, { targetE, targetFlag, upper: pooledPriorPhiUpper(panel.filter((_, i) => panelFlag[i])) }];
          })
        );
        const all = pooledPriorPhiUpper(panel);
        const byTruth = pooledPriorPhiUpper(panel.filter((p) => !p.careless));
        const priorFor: Record<string, (p: Person, i: number) => number> = {
          fixed: () => REFIT_PRIOR_PHI,
          "upper-all": () => all.upper,
          "gate-beta": (_p, i) => (est.beta.targetFlag[i] ? est.beta.upper.upper : REFIT_PRIOR_PHI),
          "gate-pooled": (_p, i) => (est.pooled.targetFlag[i] ? est.pooled.upper.upper : REFIT_PRIOR_PHI),
          "gate-oracle": (p) => (p.careless ? REFIT_PRIOR_PHI : byTruth.upper),
        };
        const out: Record<string, unknown> = {
          upperAll: r3(all.upper),
          upperOracle: r3(byTruth.upper),
          ...Object.fromEntries(
            Object.entries(est).map(([name, { targetE, targetFlag, upper }]) => {
              const h = targets.map((p, i) => i).filter((i) => !targets[i].careless);
              const c = targets.map((p, i) => i).filter((i) => targets[i].careless);
              return [name, {
                upper: r3(upper.upper),
                // Share of honest targets called honest, share of careless called careless.
                honestKept: r3(mean(h.map((i) => +targetFlag[i]))),
                carelessCaught: r3(mean(c.map((i) => +!targetFlag[i]))),
                eHonest: r3(mean(h.map((i) => targetE[i]))),
                eCareless: r3(mean(c.map((i) => targetE[i]))),
                auc: r3(auc(h.map((i) => targetE[i]), c.map((i) => targetE[i]))),
              }];
            })
          ),
        };
        for (const [name, f] of Object.entries(priorFor)) {
          const res = targets.map((p, i) => ({ careless: p.careless, ...pairCoverage(p, f(p, i)) }));
          out[name] = {
            honest: r3(mean(res.filter((r) => !r.careless).map((r) => r.cov))),
            careless: r3(mean(res.filter((r) => r.careless).map((r) => r.cov))),
            all: r3(mean(res.map((r) => r.cov))),
            w: r3(mean(res.map((r) => r.w))),
          };
        }
        cell[sel] = out;
      }
      console.log(JSON.stringify(cell));
      if (jsonl) appendFileSync(jsonl, JSON.stringify({ seedBase, seeds: nSeeds, ...cell }) + "\n");
    }
  }
}
