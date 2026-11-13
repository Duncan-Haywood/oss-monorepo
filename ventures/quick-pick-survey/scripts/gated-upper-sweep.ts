/**
 * Can the pairwise intervals use the pooled prior's upper end for the
 * respondents a lapse estimate calls honest, and keep the fixed prior for the
 * rest? (docs/INFORMATION-GAIN-SELECTOR.md, "A lapse gate for the upper end".)
 * Follows scripts/upper-phi-interval-sweep.ts, with mixed panels: a share of
 * each panel (every 1/share-th respondent) answers carelessly at --lapse.
 *
 * Priors per respondent:
 *   fixed      sd 2.0 for everyone (what the screen uses today)
 *   upper-all  the upper end pooled over the whole independent panel, for everyone
 *   gate-own   the upper end pooled over the panel's respondents whose own
 *              prequential lapse estimate (lapseEstimate.ts estimateLapse,
 *              Beta(1, 19) prior) is under --tau, for respondents under --tau;
 *              fixed for the rest
 *   gate-pool  the same, with each respondent's lapse read against the
 *              panel's pooled lapse distribution (pooledLapsePrior + posteriorMean)
 *   gate-refit the same, with the lapse read in-sample from the person's own
 *              refit at the fixed prior (refitLapse below)
 *   oracle     the gate a perfect detector would give: truly honest pool, upper
 *              end for truly honest respondents, fixed for careless ones
 *
 * Prints per cell, for honest and careless respondents separately: mean
 * coverage of every pair's 95% interval and mean half-width (logits); the
 * share of each group each gate passes; and the pooled sd and upper end.
 *
 *   npx tsx scripts/gated-upper-sweep.ts [--seeds 40] [--seed-base 1000] [--items 15,30] [--per-item 4,8] [--share 0.25,0.5] [--lapse 0.2] [--tau 0.1] [--selectors shipped,staged] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, pooledPriorPhiUpper, REFIT_PRIOR_PHI, type RefitAnswer } from "../src/lib/btRefit";
import { DEFAULT_PRIOR_B, LAPSE_GRID, pooledLapsePrior, posteriorMean, type LapseAnswer } from "../src/lib/lapseEstimate";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "40"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "15,30").split(",").map(Number);
const perItem = opt("--per-item", "4,8").split(",").map(Number);
const shares = opt("--share", "0.25,0.5").split(",").map(Number);
const lapse = Number(opt("--lapse", "0.2"));
const tau = Number(opt("--tau", "0.1"));
const selectorNames = opt("--selectors", "shipped,staged").split(",");
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => (v.length === 0 ? NaN : v.reduce((a, b) => a + b, 0) / v.length);
const r3 = (x: number) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

const b19 = LAPSE_GRID.map((e) => (DEFAULT_PRIOR_B - 1) * Math.log1p(-e));
/** Grid log-likelihood of the lapse share from prequential answers (each carries p). */
const lapseLogLik = (h: readonly LapseAnswer[]) =>
  LAPSE_GRID.map((e) => h.reduce((s, a) => s + Math.log(e / 2 + (1 - e) * (a.p ?? 0.5)), 0));

type Person = { ids: string[]; answers: RefitAnswer[]; truth: number[]; careless: boolean; ll: number[]; eOwn: number; ePool: number; eRefit: number };

/**
 * Lapse read against the person's own refit at the fixed prior (what the
 * insights route already computes): in-sample p of each answer, the refit's
 * difference variance folded in with the probit approximation.
 */
function refitLapse(ids: readonly string[], answers: readonly RefitAnswer[]): number {
  const fit = refitRatings(ids, answers);
  const n = ids.length;
  const at = new Map(ids.map((id, i) => [id, i]));
  const h: LapseAnswer[] = answers.map((a) => {
    const i = at.get(a.winner)!, j = at.get(a.loser)!;
    const v = fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j];
    const d = (fit.mu[i] - fit.mu[j]) / Math.sqrt(1 + (Math.PI * v) / 8);
    return { picked: a.winner, other: a.loser, p: 1 / (1 + Math.exp(-d)) };
  });
  return posteriorMean(lapseLogLik(h), b19);
}

/** Chance a random careless respondent scores above a random honest one (ties count half). */
function auc(honest: number[], careless: number[]): number {
  if (honest.length === 0 || careless.length === 0) return NaN;
  let s = 0;
  for (const c of careless) for (const h of honest) s += c > h ? 1 : c === h ? 0.5 : 0;
  return s / (honest.length * careless.length);
}

const run = (sel: string, items: number, budget: number, seed: number, careless: boolean): Person => {
  const r = simulate(SELECTORS[sel], items, budget, seed, careless ? lapse : 0);
  const ids = [...r.truth.keys()];
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  const ll = lapseLogLik(r.history);
  return { ids, answers, truth: ids.map((id) => 2 * r.truth.get(id)!), careless, ll, eOwn: posteriorMean(ll, b19), ePool: NaN, eRefit: refitLapse(ids, answers) };
};

const panelOf = (sel: string, items: number, budget: number, base: number, share: number) => {
  const every = Math.round(1 / share);
  const people = seeds.map((s, i) => run(sel, items, budget, s + base, share > 0 && i % every === 0));
  const prior = pooledLapsePrior(people.map((p) => p.ll)).map(Math.log);
  for (const p of people) p.ePool = posteriorMean(p.ll, prior);
  // The survey-level reading: the pooled lapse distribution's mass above tau.
  const survey = prior.reduce((s, lw, k) => s + (LAPSE_GRID[k] >= tau ? Math.exp(lw) : 0), 0);
  return Object.assign(people, { survey });
};

function coverage(p: Person, phi: number) {
  const n = p.ids.length;
  const fit = refitRatings(p.ids, p.answers, { priorPhi: phi });
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

for (const items of itemCounts) {
  for (const k of perItem) {
    for (const share of shares) {
      const cell: Record<string, unknown> = { items, perItem: k, share, lapse, tau };
      for (const sel of selectorNames) {
        const budget = k * items;
        const pool = panelOf(sel, items, budget, 100000, share);
        const evalPanel = panelOf(sel, items, budget, 0, share);
        // Gates that pass the same respondents share one pooled search (it dominates the run time).
        const memo = new Map<string, { phi: number; upper: number }>();
        const upperOf = (who: Person[]) => {
          if (who.length === 0) return { phi: REFIT_PRIOR_PHI, upper: REFIT_PRIOR_PHI };
          const key = who.map((p) => pool.indexOf(p)).join(",");
          let r = memo.get(key);
          if (!r) memo.set(key, (r = pooledPriorPhiUpper(who)));
          return r;
        };
        const all = upperOf(pool);
        const own = upperOf(pool.filter((p) => p.eOwn < tau));
        const pooled = upperOf(pool.filter((p) => p.ePool < tau));
        const refit = upperOf(pool.filter((p) => p.eRefit < tau));
        const oracle = upperOf(pool.filter((p) => !p.careless));
        const rules: Record<string, (p: Person) => number> = {
          fixed: () => REFIT_PRIOR_PHI,
          "upper-all": () => all.upper,
          "gate-own": (p) => (p.eOwn < tau ? own.upper : REFIT_PRIOR_PHI),
          "gate-pool": (p) => (p.ePool < tau ? pooled.upper : REFIT_PRIOR_PHI),
          "gate-refit": (p) => (p.eRefit < tau ? refit.upper : REFIT_PRIOR_PHI),
          oracle: (p) => (p.careless ? REFIT_PRIOR_PHI : oracle.upper),
        };
        const out: Record<string, unknown> = {
          phi: { all: r3(all.phi), own: r3(own.phi), pool: r3(pooled.phi), refit: r3(refit.phi), oracle: r3(oracle.phi) },
          upper: { all: r3(all.upper), own: r3(own.upper), pool: r3(pooled.upper), refit: r3(refit.upper), oracle: r3(oracle.upper) },
          surveyMassAboveTau: r3(evalPanel.survey),
        };
        const groups = { honest: evalPanel.filter((p) => !p.careless), careless: evalPanel.filter((p) => p.careless) };
        out.passed = Object.fromEntries(
          Object.entries(groups).map(([g, ps]) => [g, { own: r3(mean(ps.map((p) => +(p.eOwn < tau)))), pool: r3(mean(ps.map((p) => +(p.ePool < tau)))), refit: r3(mean(ps.map((p) => +(p.eRefit < tau)))) }])
        );
        const pick = (f: (p: Person) => number) => auc(groups.honest.map(f), groups.careless.map(f));
        out.auc = { own: r3(pick((p) => p.eOwn)), pool: r3(pick((p) => p.ePool)), refit: r3(pick((p) => p.eRefit)) };
        out.meanE = Object.fromEntries(Object.entries(groups).map(([g, ps]) => [g, { own: r3(mean(ps.map((p) => p.eOwn))), pool: r3(mean(ps.map((p) => p.ePool))), refit: r3(mean(ps.map((p) => p.eRefit))) }]));
        // One refit per respondent per distinct prior sd.
        const cache = new Map<string, { cov: number; w: number }>();
        const cov = (p: Person, i: number, phi: number) => {
          const key = `${i}:${phi}`;
          let c = cache.get(key);
          if (!c) cache.set(key, (c = coverage(p, phi)));
          return c;
        };
        for (const [name, rule] of Object.entries(rules)) {
          const res: Record<string, unknown> = {};
          for (const [g, ps] of Object.entries(groups)) {
            const cs = ps.map((p) => cov(p, evalPanel.indexOf(p), rule(p)));
            res[g] = { cov: r3(mean(cs.map((c) => c.cov))), w: r3(mean(cs.map((c) => c.w))) };
          }
          out[name] = res;
        }
        cell[sel] = out;
      }
      console.log(JSON.stringify(cell));
      if (jsonl) appendFileSync(jsonl, JSON.stringify({ seedBase, seeds: nSeeds, ...cell }) + "\n");
    }
  }
}
