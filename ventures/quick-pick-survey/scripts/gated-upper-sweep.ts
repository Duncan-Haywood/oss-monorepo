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
 *   gate-half  a rank gate: the upper end pooled over the more consistent half
 *              of the panel by refitLapse, for respondents at or under that
 *              half's cut; fixed for the rest
 *   oracle     the gate a perfect detector would give: truly honest pool, upper
 *              end for truly honest respondents, fixed for careless ones
 *
 * With --every N > 0, every N-th answer is an anchor pair (the most lopsided
 * pair by the respondent's own ratings, as scripts/anchor-lapse-sweep.ts), for
 * every respondent and under every rule, so the fixed baseline pays for the
 * anchors too. Three more gates read the lapse from the anchor answers only
 * (each scored with the ratings' chance just before it):
 *   anchor-half  the rank gate with the anchor estimate (uniform prior)
 *   anchor-tau   the anchor estimate against the panel's pooled anchor-lapse
 *                prior (pooledLapsePrior + posteriorMean), under --tau-anchor
 *   anchor-mass  pass the pool's lowest (1 - m) share by the anchor estimate,
 *                m the pooled anchor prior's mass at or above --tau (the
 *                panel's own reading of its careless share)
 *
 * Prints per cell, for honest and careless respondents separately: mean
 * coverage of every pair's 95% interval and mean half-width (logits); the
 * share of each group each gate passes; and the pooled sd and upper end.
 *
 *   npx tsx scripts/gated-upper-sweep.ts [--every 0] [--tau-anchor 0.15] [--seeds 40] [--seed-base 1000] [--items 15,30] [--per-item 4,8] [--share 0.25,0.5] [--lapse 0.2] [--tau 0.1] [--selectors shipped,staged] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid, pairKey, type PairingInput } from "../src/lib/pairing";
import { DEFAULT_GLICKO_STATE } from "../src/lib/glicko2";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, pooledPriorPhiUpper, REFIT_PRIOR_PHI, type RefitAnswer } from "../src/lib/btRefit";
import { DEFAULT_PRIOR_B, LAPSE_GRID, pickProbability, pooledLapsePrior, posteriorMean, type LapseAnswer } from "../src/lib/lapseEstimate";

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
const every = Number(opt("--every", "0"));
const tauAnchor = Number(opt("--tau-anchor", "0.15"));
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => (v.length === 0 ? NaN : v.reduce((a, b) => a + b, 0) / v.length);
const r3 = (x: number) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

/** Every `every`-th answer is the most lopsided eligible pair (scripts/anchor-lapse-sweep.ts's rule). */
function withAnchors(base: Policy, anchors: Set<number>): Policy {
  return (input: PairingInput) => {
    const n = input.answeredCount ?? 0;
    if (every > 0 && n > 0 && n % every === 0) {
      const pool = input.items.filter((it) => (input.timesShown.get(it.id) ?? 0) >= 2);
      let best: [string, string] | null = null;
      let bestGap = -1;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          if (input.recentPairKeys.has(pairKey(pool[i].id, pool[j].id))) continue;
          const gap = Math.abs(pickProbability({ ...DEFAULT_GLICKO_STATE, ...pool[i] }, { ...DEFAULT_GLICKO_STATE, ...pool[j] }) - 0.5);
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

const flat = LAPSE_GRID.map(() => 0);
const b19 = LAPSE_GRID.map((e) => (DEFAULT_PRIOR_B - 1) * Math.log1p(-e));
/** Grid log-likelihood of the lapse share from prequential answers (each carries p). */
const lapseLogLik = (h: readonly LapseAnswer[]) =>
  LAPSE_GRID.map((e) => h.reduce((s, a) => s + Math.log(e / 2 + (1 - e) * (a.p ?? 0.5)), 0));

type Person = { ids: string[]; answers: RefitAnswer[]; truth: number[]; careless: boolean; ll: number[]; eOwn: number; ePool: number; eRefit: number; llA: number[]; nA: number; eA: number; eAPool: number };

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
  const anchors = new Set<number>();
  const r = simulate(withAnchors(SELECTORS[sel], anchors), items, budget, seed, careless ? lapse : 0);
  const ids = [...r.truth.keys()];
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  const ll = lapseLogLik(r.history);
  const llA = lapseLogLik(r.history.filter((_, i) => anchors.has(i)));
  return { ids, answers, truth: ids.map((id) => 2 * r.truth.get(id)!), careless, ll, eOwn: posteriorMean(ll, b19), ePool: NaN, eRefit: refitLapse(ids, answers), llA, nA: anchors.size, eA: posteriorMean(llA, flat), eAPool: NaN };
};

const panelOf = (sel: string, items: number, budget: number, base: number, share: number) => {
  const every = Math.round(1 / share);
  const people = seeds.map((s, i) => run(sel, items, budget, s + base, share > 0 && i % every === 0));
  const prior = pooledLapsePrior(people.map((p) => p.ll)).map(Math.log);
  for (const p of people) p.ePool = posteriorMean(p.ll, prior);
  // The survey-level reading: the pooled lapse distribution's mass above tau.
  const survey = prior.reduce((s, lw, k) => s + (LAPSE_GRID[k] >= tau ? Math.exp(lw) : 0), 0);
  // The same from the anchor answers only.
  const priorA = every > 0 ? pooledLapsePrior(people.map((p) => p.llA)).map(Math.log) : flat;
  for (const p of people) p.eAPool = posteriorMean(p.llA, priorA);
  const surveyA = every > 0 ? priorA.reduce((s, lw, k) => s + (LAPSE_GRID[k] >= tau ? Math.exp(lw) : 0), 0) : NaN;
  return Object.assign(people, { survey, surveyA });
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
      const cell: Record<string, unknown> = { items, perItem: k, share, lapse, tau, every, tauAnchor };
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
        // A rank gate: the pool's more consistent half by refitLapse, and the same cut for respondents.
        const cut = [...pool.map((p) => p.eRefit)].sort((x, y) => x - y)[Math.floor((pool.length - 1) / 2)];
        const half = upperOf(pool.filter((p) => p.eRefit <= cut));
        const oracle = upperOf(pool.filter((p) => !p.careless));
        // Anchor gates (only with --every): a rank cut, a pooled-prior threshold, and a cut at the panel's own careless share.
        const sortedA = [...pool.map((p) => p.eA)].sort((x, y) => x - y);
        const cutA = sortedA[Math.floor((pool.length - 1) / 2)];
        const keep = Math.max(1, Math.round((1 - (Number.isFinite(pool.surveyA) ? pool.surveyA : 0)) * pool.length));
        const cutM = sortedA[keep - 1];
        const aHalf = upperOf(pool.filter((p) => p.eA <= cutA));
        const aTau = upperOf(pool.filter((p) => p.eAPool < tauAnchor));
        const aMass = upperOf(pool.filter((p) => p.eA <= cutM));
        const rules: Record<string, (p: Person) => number> = {
          fixed: () => REFIT_PRIOR_PHI,
          "upper-all": () => all.upper,
          "gate-own": (p) => (p.eOwn < tau ? own.upper : REFIT_PRIOR_PHI),
          "gate-pool": (p) => (p.ePool < tau ? pooled.upper : REFIT_PRIOR_PHI),
          "gate-refit": (p) => (p.eRefit < tau ? refit.upper : REFIT_PRIOR_PHI),
          "gate-half": (p) => (p.eRefit <= cut ? half.upper : REFIT_PRIOR_PHI),
          oracle: (p) => (p.careless ? REFIT_PRIOR_PHI : oracle.upper),
        };
        // The eval panel's own pooled anchor prior for anchor-tau (as a live survey would read it).
        if (every > 0) {
          rules["anchor-half"] = (p) => (p.eA <= cutA ? aHalf.upper : REFIT_PRIOR_PHI);
          rules["anchor-tau"] = (p) => (p.eAPool < tauAnchor ? aTau.upper : REFIT_PRIOR_PHI);
          rules["anchor-mass"] = (p) => (p.eA <= cutM ? aMass.upper : REFIT_PRIOR_PHI);
        }
        const out: Record<string, unknown> = {
          phi: { all: r3(all.phi), own: r3(own.phi), pool: r3(pooled.phi), refit: r3(refit.phi), half: r3(half.phi), oracle: r3(oracle.phi) },
          upper: { all: r3(all.upper), own: r3(own.upper), pool: r3(pooled.upper), refit: r3(refit.upper), half: r3(half.upper), oracle: r3(oracle.upper) },
          surveyMassAboveTau: r3(evalPanel.survey),
        };
        if (every > 0) {
          out.anchorsPerPerson = r3(mean(evalPanel.map((p) => p.nA)));
          out.anchorMassAboveTau = { pool: r3(pool.surveyA), eval: r3(evalPanel.surveyA) };
          out.upperAnchor = { half: r3(aHalf.upper), tau: r3(aTau.upper), mass: r3(aMass.upper) };
        }
        const groups = { honest: evalPanel.filter((p) => !p.careless), careless: evalPanel.filter((p) => p.careless) };
        out.passed = Object.fromEntries(
          Object.entries(groups).map(([g, ps]) => [g, { own: r3(mean(ps.map((p) => +(p.eOwn < tau)))), pool: r3(mean(ps.map((p) => +(p.ePool < tau)))), refit: r3(mean(ps.map((p) => +(p.eRefit < tau)))), half: r3(mean(ps.map((p) => +(p.eRefit <= cut)))) }])
        );
        const pick = (f: (p: Person) => number) => auc(groups.honest.map(f), groups.careless.map(f));
        out.auc = { own: r3(pick((p) => p.eOwn)), pool: r3(pick((p) => p.ePool)), refit: r3(pick((p) => p.eRefit)), ...(every > 0 ? { anchor: r3(pick((p) => p.eA)) } : {}) };
        // Selection effect: among honest respondents, does a lower lapse estimate go with a wider true spread?
        // (Spearman of each estimate with the sd of the person's true logits; negative = consistent people are wider.)
        const sdOf = (t: number[]) => Math.sqrt(mean(t.map((x) => (x - mean(t)) ** 2)));
        const hs = groups.honest.map((p) => sdOf(p.truth));
        out.spreadRho = { own: r3(spearman(groups.honest.map((p) => p.eOwn), hs)), refit: r3(spearman(groups.honest.map((p) => p.eRefit), hs)), ...(every > 0 ? { anchor: r3(spearman(groups.honest.map((p) => p.eA), hs)) } : {}) };
        if (every > 0) {
          out.passedAnchor = Object.fromEntries(
            Object.entries(groups).map(([g, ps]) => [g, { half: r3(mean(ps.map((p) => +(p.eA <= cutA)))), tau: r3(mean(ps.map((p) => +(p.eAPool < tauAnchor)))), mass: r3(mean(ps.map((p) => +(p.eA <= cutM)))) }])
          );
        }
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
