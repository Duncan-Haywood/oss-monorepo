/**
 * Which prior sd should the "it's between" set use when a survey's
 * respondents differ? The earlier sweeps (scripts/favourite-set-sweep.ts
 * --eb --pool) pooled the prior over a panel that shared one design, one
 * spread of likes and one lapse rate, so the pooled estimate was the right
 * answer for everyone in it. A real survey mixes people: some care a lot
 * about the differences between items, some barely, some answer carelessly.
 * This sweep draws each respondent's spread and lapse rate from a mixture and
 * scores the set under five priors:
 *
 *   fixed   the refit's fixed sd (REFIT_PRIOR_PHI, 2.0)
 *   own     the person's own empirical-Bayes estimate (shipped 2026-11-12)
 *   pool    one sd per survey, pooled over an independent panel drawn from the same mixture
 *   shrink  the geometric mean of own and pool (half-way on the log scale)
 *   min     the narrower of own and pool (a narrower prior widens the set)
 *
 * Counted, as in favourite-set-sweep.ts, only where the fixed-prior clear-pick
 * rule does not fire (that is when the card shows the list). Coverage is the
 * share of shown lists that hold the true favourite; size is the list's
 * length. Reported over all respondents and per mixture group.
 *
 *   npx tsx scripts/mixed-prior-sweep.ts [--seeds 60] [--seed-base 1000] [--items 8,15,30] [--per-item 2,4,8] [--spreads 0.5,1,2] [--lapses 0,0.2] [--level 0.95] [--selectors shipped,staged]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { GLICKO_SCALE } from "../src/lib/glicko2";
import { refitRatings, empiricalPriorPhi, pooledPriorPhi, type RefitAnswer } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";
import { favouriteSet } from "../src/lib/favouriteSet";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "60"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const spreads = opt("--spreads", "0.5,1,2").split(",").map(Number);
const lapses = opt("--lapses", "0,0.2").split(",").map(Number);
const level = Number(opt("--level", "0.95"));
const selectorNames = opt("--selectors", "shipped,staged").split(",");
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};
const METHODS = ["fixed", "own", "pool", "shrink", "min"] as const;
type Method = (typeof METHODS)[number];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Respondent i of a panel: spread and lapse cycle through the mixture, so every group is equally represented.
const groupOf = (i: number) => ({ spread: spreads[i % spreads.length], lapse: lapses[Math.floor(i / spreads.length) % lapses.length] });

function respondent(sel: string, items: number, k: number, seed: number, i: number) {
  const { spread, lapse } = groupOf(i);
  const r = simulate(SELECTORS[sel], items, k * items, seed, lapse, 0, 0, false, undefined, 0, undefined, (_i, d) => d * spread);
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  return { r, ids: [...r.truth.keys()], answers, spread, lapse };
}

for (const sel of selectorNames) {
  type Tally = { hit: number[]; size: number[] };
  const tally = new Map<string, Tally>();
  const add = (key: string, hit: boolean, size: number) => {
    const t = tally.get(key) ?? { hit: [], size: [] };
    t.hit.push(hit ? 1 : 0);
    t.size.push(size);
    tally.set(key, t);
  };
  const worst = new Map<Method, number>();
  const poolPhis: Record<string, number> = {};
  for (const items of itemCounts) {
    for (const k of perItem) {
      const panel = Array.from({ length: nSeeds }, (_, i) => respondent(sel, items, k, seedBase + i * 7 + 100000, i));
      const poolPhi = pooledPriorPhi(panel.map(({ ids, answers }) => ({ ids, answers })));
      poolPhis[`${items}x${k}`] = Number(poolPhi.toFixed(2));
      const cell = new Map<Method, number[]>();
      for (let i = 0; i < nSeeds; i++) {
        const { r, ids, answers, spread, lapse } = respondent(sel, items, k, seedBase + i * 7, i);
        const n = ids.length;
        const truth = ids.map((id) => r.truth.get(id)!);
        const top = truth.indexOf(Math.max(...truth));
        const fit = refitRatings(ids, answers);
        const c = ids.map((id, j) => ({ key: id, rating: fit.rating.get(id)!, j }));
        const sd = (x: (typeof c)[number], y: (typeof c)[number]) =>
          GLICKO_SCALE * Math.sqrt(Math.max(0, fit.cov[x.j * n + x.j] + fit.cov[y.j * n + y.j] - 2 * fit.cov[x.j * n + y.j]));
        if (clearPick(c, sd)!.clear) continue;
        const own = empiricalPriorPhi(ids, answers);
        const phis: Record<Method, number | null> = { fixed: null, own, pool: poolPhi, shrink: Math.sqrt(own * poolPhi), min: Math.min(own, poolPhi) };
        for (const m of METHODS) {
          const g = phis[m] === null ? fit : refitRatings(ids, answers, { priorPhi: phis[m]! });
          const f = favouriteSet(g.mu, g.cov, { level });
          const hit = f.members.includes(top);
          add(`${m}|all`, hit, f.members.length);
          add(`${m}|spread${spread}`, hit, f.members.length);
          add(`${m}|lapse${lapse}`, hit, f.members.length);
          add(`${m}|spread${spread},lapse${lapse}`, hit, f.members.length);
          const h = cell.get(m) ?? [];
          h.push(hit ? 1 : 0);
          cell.set(m, h);
        }
      }
      for (const m of METHODS) worst.set(m, Math.min(worst.get(m) ?? 1, mean(cell.get(m) ?? [1])));
    }
  }
  console.log(JSON.stringify({ selector: sel, level, spreads, lapses, poolPhi: poolPhis }));
  const groups = [...new Set([...tally.keys()].map((k) => k.split("|")[1]))];
  for (const g of groups) {
    const row: Record<string, unknown> = { selector: sel, group: g, n: tally.get(`fixed|${g}`)?.hit.length ?? 0 };
    for (const m of METHODS) {
      const t = tally.get(`${m}|${g}`);
      if (t) row[m] = `${mean(t.hit).toFixed(3)} / ${mean(t.size).toFixed(2)}`;
    }
    console.log(JSON.stringify(row));
  }
  console.log(JSON.stringify({ selector: sel, worstCellCoverage: Object.fromEntries([...worst].map(([m, v]) => [m, Number(v.toFixed(3))])) }));
}
