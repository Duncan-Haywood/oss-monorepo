/**
 * Anchor pairs and a pooled survey prior as the signal for a per-respondent
 * lapse estimate (docs/INFORMATION-GAIN-SELECTOR.md, "Anchor pairs and a
 * pooled survey prior").
 *
 * The previous measurement ("A per-respondent lapse estimate") found that the
 * adaptive selectors ask pairs the ratings call close, so a coin flip looks
 * like an honest answer and a person's own answers say almost nothing about
 * their lapse share e. Two fixes it named, measured here:
 *
 * - **Anchor pairs.** Every `--every` answers, instead of the selector's pair,
 *   ask the pair this respondent's own ratings call most lopsided (largest
 *   |p - 1/2| with rd folded in, both items shown at least `--min-shown`
 *   times, not among the last 10 pairs). An honest person almost always
 *   agrees with their own clear preferences; a coin flip disagrees half the
 *   time. e is read from the anchor answers only, each scored with the chance
 *   the ratings gave it just before the answer (prequential).
 * - **A pooled survey prior.** Respondents of one survey share a lapse
 *   distribution. Fit it over the e grid from everyone's anchor likelihoods
 *   (nonparametric maximum likelihood, EM on grid weights), then each
 *   person's estimate is their own likelihood times that population prior.
 *
 * Each "survey" is `--respondents` synthetic people (src/lib/infoGainSim.ts),
 * each with a true e drawn from the mix `--mix` (e:share,...). For each list
 * length and budget prints, per scorer: mean final estimate by true e, the
 * AUC for telling honest (e = 0) from lapsers (e >= 0.2), and the mean rank
 * accuracy of the ratings (to price the answers spent on anchors). Scorers:
 *   none-*     no anchors (--every 0): every answer scored (the earlier result)
 *   anchor-b19 anchors only, Beta(1, 19) prior (DEFAULT_PRIOR_B, mean 0.05)
 *   anchor-flat anchors only, uniform prior (the data alone)
 *   pooled     the same answers, population prior fitted by EM per survey
 *   oracle-flat the same answers scored with the true win chance (the ceiling)
 *
 *   npx tsx scripts/anchor-lapse-sweep.ts [--items 15,30] [--per-item 4,8] [--every 0,10,5] [--respondents 60] [--surveys 3] [--mix 0:0.6,0.1:0.15,0.2:0.1,0.5:0.15] [--selector staged] [--min-shown 2] [--seed-base 1000]
 */
import { selectNextPair, selectNextPairHybrid, pairKey, type PairingInput } from "../src/lib/pairing";
import { simulate, type LapseSource, type Policy } from "../src/lib/infoGainSim";
import { DEFAULT_PRIOR_B, LAPSE_GRID, pickProbability, pooledLapsePrior, posteriorMean, type LapseAnswer } from "../src/lib/lapseEstimate";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const itemCounts = opt("--items", "15,30").split(",").map(Number);
const perItem = opt("--per-item", "4,8").split(",").map(Number);
const everies = opt("--every", "0,10,5").split(",").map(Number);
const nResp = Number(opt("--respondents", "60"));
const nSurveys = Number(opt("--surveys", "3"));
const minShown = Number(opt("--min-shown", "2"));
const seedBase = Number(opt("--seed-base", "1000"));
const selName = opt("--selector", "staged");
const mix = opt("--mix", "0:0.6,0.1:0.15,0.2:0.1,0.5:0.15")
  .split(",")
  .map((s) => s.split(":").map(Number) as [number, number]);

const BASE: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

/** Wraps a selector so every `every`-th answer is the most lopsided eligible pair. */
function withAnchors(base: Policy, every: number, anchors: Set<number>): Policy {
  return (input: PairingInput) => {
    const n = input.answeredCount ?? 0;
    if (every > 0 && n > 0 && n % every === 0) {
      const shown = input.timesShown;
      const pool = input.items.filter((it) => (shown.get(it.id) ?? 0) >= minShown);
      let best: [string, string] | null = null;
      let bestGap = -1;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          if (input.recentPairKeys.has(pairKey(pool[i].id, pool[j].id))) continue;
          const p = pickProbability(pool[i], pool[j]);
          const gap = Math.abs(p - 0.5);
          if (gap > bestGap) {
            bestGap = gap;
            // Random side, so position bias cannot fake agreement.
            best = (input.rand ?? Math.random)() < 0.5 ? [pool[i].id, pool[j].id] : [pool[j].id, pool[i].id];
          }
        }
      }
      if (best) {
        anchors.add(n);
        return best;
      }
    }
    return base(input);
  };
}

/** Grid log-likelihood of a set of scored answers (no prior). */
function logLik(answers: readonly LapseAnswer[]): number[] {
  return LAPSE_GRID.map((e) => answers.reduce((s, a) => s + Math.log(e / 2 + (1 - e) * (a.p ?? 0.5)), 0));
}

function auc(neg: number[], pos: number[]): number {
  let s = 0;
  for (const x of pos) for (const y of neg) s += x > y ? 1 : x === y ? 0.5 : 0;
  return neg.length && pos.length ? s / (neg.length * pos.length) : NaN;
}

function drawLapse(u: number): number {
  let acc = 0;
  for (const [e, w] of mix) {
    acc += w;
    if (u < acc) return e;
  }
  return mix[mix.length - 1][0];
}

const b19Prior = LAPSE_GRID.map((e) => (DEFAULT_PRIOR_B - 1) * Math.log1p(-e));
const uniformPrior = LAPSE_GRID.map(() => 0);

for (const items of itemCounts) {
  for (const k of perItem) {
    for (const every of everies) {
      const budget = k * items;
      const rows: { e: number; ll: number[]; llOracle: number[]; nAnch: number; acc: number }[] = [];
      for (let sv = 0; sv < nSurveys; sv++) {
        for (let r = 0; r < nResp; r++) {
          const seed = seedBase + sv * 10007 + r * 7;
          const e = drawLapse(((seed * 2654435761) >>> 0) / 4294967296);
          const anchors = new Set<number>();
          let seenModel: readonly LapseAnswer[] = [];
          const spy: LapseSource = (a) => ((seenModel = a), 0);
          const res = simulate(withAnchors(BASE[selName], every, anchors), items, budget, seed, e, 0, 0, false, undefined, spy);
          // Same seed, same draws, oracle p: the anchors land on the same answers.
          const anchors2 = new Set<number>();
          let seenOracle: readonly LapseAnswer[] = [];
          const spyO: LapseSource = (a) => ((seenOracle = a), 0);
          spyO.oracle = true;
          simulate(withAnchors(BASE[selName], every, anchors2), items, budget, seed, e, 0, 0, false, undefined, spyO);
          // The spy saw history before the last answer; good enough (one answer).
          const pick = (h: readonly LapseAnswer[], set: Set<number>) => (every > 0 ? h.filter((_, i) => set.has(i)) : h);
          rows.push({ e, ll: logLik(pick(seenModel, anchors)), llOracle: logLik(pick(seenOracle, anchors2)), nAnch: anchors.size, acc: res.rankAccuracy });
        }
      }
      // Pooled prior per survey, fitted on that survey's respondents only.
      const pooledEst: number[] = [];
      for (let sv = 0; sv < nSurveys; sv++) {
        const block = rows.slice(sv * nResp, (sv + 1) * nResp);
        const prior = pooledLapsePrior(block.map((x) => x.ll));
        for (const x of block) pooledEst.push(posteriorMean(x.ll, prior.map(Math.log)));
      }
      const scorers: Record<string, number[]> = {
        [every > 0 ? "anchor-b19" : "none-b19"]: rows.map((x) => posteriorMean(x.ll, b19Prior)),
        [every > 0 ? "anchor-flat" : "none-flat"]: rows.map((x) => posteriorMean(x.ll, uniformPrior)),
        pooled: pooledEst,
        "oracle-flat": rows.map((x) => posteriorMean(x.llOracle, uniformPrior)),
      };
      const cell: Record<string, unknown> = {
        items,
        perItem: k,
        every,
        anchorsPerPerson: Number(mean(rows.map((x) => x.nAnch)).toFixed(1)),
        rankAccuracy: Number(mean(rows.map((x) => x.acc)).toFixed(3)),
      };
      const truths = [...new Set(mix.map(([e]) => e))];
      for (const [name, est] of Object.entries(scorers)) {
        const byE = truths.map((t) => Number(mean(est.filter((_, i) => rows[i].e === t)).toFixed(3)));
        const honest = est.filter((_, i) => rows[i].e === 0);
        const lapsers = est.filter((_, i) => rows[i].e >= 0.2);
        cell[name] = { byTrueE: Object.fromEntries(truths.map((t, i) => [t, byE[i]])), auc: Number(auc(honest, lapsers).toFixed(3)) };
      }
      console.log(JSON.stringify(cell));
    }
  }
}
