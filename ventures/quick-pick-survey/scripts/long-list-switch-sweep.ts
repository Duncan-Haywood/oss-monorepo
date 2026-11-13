/**
 * Item (e) of the plan: on lists over 120 items, which selector should a
 * survey get by default, and where should the staged one hand over? Compares
 * the shipped selector, staged with its 120-answer warm-up (the rule above 120
 * items before 2026-11-13) and staged from the first answer (the rule up to 120
 * items), plus any --switches given, on the synthetic respondent of
 * src/lib/infoGainSim.ts. Prints one JSON row per (items, lapse, selector,
 * answers): rank accuracy, items under rd 200 and rd 150, how many of the true
 * top 10 are in the estimated top 10, top-1 hit, the insights card's clear pick
 * (src/lib/clearPick.ts on the refit, up to REFIT_MAX_ITEMS) as fire rate and
 * wrong share, each seed's rank accuracy (`rankBySeed`, the same seeds in
 * every selector's row, for paired differences), and the answer count at which the couple screen's bar (8 items
 * under rd 200) is first met. docs/INFORMATION-GAIN-SELECTOR.md, "Lists over
 * 120 items: the switch rule (2026-11-13)".
 *
 *   npx tsx scripts/long-list-switch-sweep.ts [--seeds 20] [--items 150,220,300] [--budgets 30,60,90,120,200,300,600] [--lapses 0,0.2] [--switches 60] [--no-refit]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { applyComparison, DEFAULT_GLICKO_STATE, GLICKO_SCALE, type GlickoState } from "../src/lib/glicko2";
import { refitRatings, REFIT_MAX_ITEMS } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "20"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "150,220,300").split(",").map(Number);
const budgets = opt("--budgets", "30,60,90,120,200,300,600").split(",").map(Number);
const lapses = opt("--lapses", "0,0.2").split(",").map(Number);
const extra = opt("--switches", "").split(",").filter(Boolean).map(Number);
const refit = !argv.includes("--no-refit");
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

const policies: [string, Policy][] = [
  ["shipped", (i) => selectNextPair({ ...i, answerAgreement: undefined })],
  ["staged@120", (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }, { switchAt: 120 })],
  ["staged@0", (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }, { switchAt: 0 })],
  ...extra.map((s) => [`staged@${s}`, (i: Parameters<Policy>[0]) => selectNextPairHybrid({ ...i, answerAgreement: undefined }, { switchAt: s })] as [string, Policy]),
];

for (const items of itemCounts) {
  for (const lapse of lapses) {
    for (const [name, policy] of policies) {
      // One run per seed to the largest budget; each smaller budget replays the
      // first b answers through the same Glicko update (lapse term 0, as the
      // run), so every budget shares the same answers.
      const maxB = Math.max(...budgets);
      const acc = new Map<number, { rank: number[]; u200: number[]; u150: number[]; top10: number[]; top1: number[]; fired: number[]; wrong: number[] }>();
      for (const b of budgets) acc.set(b, { rank: [], u200: [], u150: [], top10: [], top1: [], fired: [], wrong: [] });
      const couple: number[] = [];
      const started = Date.now();
      for (const s of seeds) {
        let at = Infinity;
        const r = simulate(policy, items, maxB, s, lapse, 0, 0, false, (answered, rds) => {
          if (at === Infinity && rds.filter((rd) => rd < 200).length >= 8) at = answered;
        });
        couple.push(at);
        const ids = [...r.truth.keys()];
        const truth = ids.map((id) => r.truth.get(id)!);
        const trueOrder = [...ids].sort((a, b) => r.truth.get(b)! - r.truth.get(a)!);
        const trueTop10 = new Set(trueOrder.slice(0, 10));
        for (const b of budgets) {
          const st = replay(ids, r.history.slice(0, b));
          const a = acc.get(b)!;
          const ratings = ids.map((id) => st.get(id)!.rating);
          a.rank.push(spearmanLocal(truth, ratings));
          a.u200.push(ids.filter((id) => st.get(id)!.rd < 200).length);
          a.u150.push(ids.filter((id) => st.get(id)!.rd < 150).length);
          const est = [...ids].sort((x, y) => st.get(y)!.rating - st.get(x)!.rating);
          a.top10.push(est.slice(0, 10).filter((id) => trueTop10.has(id)).length);
          a.top1.push(est[0] === trueOrder[0] ? 1 : 0);
          if (refit && items <= REFIT_MAX_ITEMS) {
            const fit = refitRatings(ids, r.history.slice(0, b).map(({ picked, other }) => ({ winner: picked, loser: other })));
            const n = ids.length;
            const c = ids.map((id, i) => ({ key: id, rating: fit.rating.get(id)!, i }));
            const sd = (x: (typeof c)[number], y: (typeof c)[number]) =>
              GLICKO_SCALE * Math.sqrt(Math.max(0, fit.cov[x.i * n + x.i] + fit.cov[y.i * n + y.i] - 2 * fit.cov[x.i * n + y.i]));
            const p = clearPick(c, sd);
            const fired = p?.clear ? 1 : 0;
            a.fired.push(fired);
            if (fired) a.wrong.push(p!.leader.key === trueOrder[0] ? 0 : 1);
          }
        }
      }
      const secs = (Date.now() - started) / 1000;
      for (const b of budgets) {
        const a = acc.get(b)!;
        console.log(JSON.stringify({
          items, lapse, selector: name, answers: b, seeds: nSeeds,
          rank: +mean(a.rank).toFixed(3),
          rankBySeed: a.rank.map((x) => +x.toFixed(4)),
          under200: +mean(a.u200).toFixed(1),
          under150: +mean(a.u150).toFixed(1),
          top10: +mean(a.top10).toFixed(2),
          top1: +mean(a.top1).toFixed(3),
          clearFires: a.fired.length ? +mean(a.fired).toFixed(3) : null,
          clearWrong: a.wrong.length ? +mean(a.wrong).toFixed(3) : null,
          coupleBarMedian: median(couple) === Infinity ? `>${maxB}` : median(couple),
          secs: +secs.toFixed(1),
        }));
      }
    }
  }
}

function replay(ids: string[], answers: readonly { picked: string; other: string }[]): Map<string, GlickoState> {
  const st = new Map<string, GlickoState>(ids.map((id) => [id, { ...DEFAULT_GLICKO_STATE }]));
  for (const { picked, other } of answers) {
    const { a, b } = applyComparison(st.get(picked)!, st.get(other)!, "A", 0);
    st.set(picked, a);
    st.set(other, b);
  }
  return st;
}

function spearmanLocal(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    order.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const n = xs.length, mx = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return num / Math.sqrt(dx * dy);
}
