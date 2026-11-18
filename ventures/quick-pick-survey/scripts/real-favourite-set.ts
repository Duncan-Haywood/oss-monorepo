/**
 * The insights card's per-person claims on real people's rankings.
 *
 * Every measurement of the clear-pick rule (src/lib/clearPick.ts) and the
 * "it's between" set (src/lib/favouriteSet.ts, src/lib/surveyPrior.ts) so far
 * drew respondents from the Bradley-Terry model the refit assumes. Here the
 * respondents are the PrefLib panels of docs/REAL-RANKINGS.md: each drawn
 * person answers `perItem x items` pairs, chosen by the survey's selector, by
 * their own written ranking (plus an optional share of coin-flip answers), and
 * the card is computed exactly as /api/insights computes it:
 *
 *   - clear pick: fixed-prior refit, leader ahead of every item by 1.645 sd;
 *   - otherwise the 95% contender list from the refit at
 *     min(own empirical-Bayes sd, the survey's pooled sd) (setPriorPhi), the
 *     survey being the people drawn in that draw (at least 10, as the route
 *     requires before it uses the stored value).
 *
 * Truth is the person's written first (or, for the bottom card, last) choice.
 * This answering is not Bradley-Terry: with no lapse a person never
 * contradicts their order however close two items are, and a lapse flips a
 * coin regardless of distance. So it tests the claims off the model they were
 * tuned on.
 *
 *   npx tsx scripts/real-favourite-set.ts [--seeds 10] [--people 20] [--per-item 2,4] [--lapses 0,0.1,0.2] [--selectors shipped,staged] [--data breakfast,shirt]
 *
 * One JSON line per cell; results in docs/REAL-RANKINGS.md, "The insights
 * card on real people".
 */
import { refitRatings, empiricalPriorPhi, pooledPriorPhi, differenceSd } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";
import { contenders } from "../src/lib/favouriteSet";
import { GLICKO_SCALE } from "../src/lib/glicko2";
import { answerWithHistory, mulberry32, parseSoc, type Selector } from "../src/lib/realRankings";
import { setPriorPhi } from "../src/lib/surveyPrior";
import { arg, DATASETS, load } from "./preflib";

const argv = process.argv;
const list = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d).split(",");
const seeds = arg("--seeds", 10);
const people = arg("--people", 20);
const perItem = list("--per-item", "2,4").map(Number);
const lapses = list("--lapses", "0,0.1,0.2").map(Number);
const selectors = list("--selectors", "shipped,staged") as Selector[];
const data = list("--data", "breakfast,shirt");

type Tally = { persons: number; clear: number; clearWrong: number; shown: number; hit: number; size: number[]; hit3: number; hitFixed: number; sizeFixed: number[]; hitOwn: number; sizeOwn: number[] };
const blank = (): Tally => ({ persons: 0, clear: 0, clearWrong: 0, shown: 0, hit: 0, size: [], hit3: 0, hitFixed: 0, sizeFixed: [], hitOwn: 0, sizeOwn: [] });
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(0.9 * (xs.length - 1))] ?? 0;
const r3 = (x: number) => Number(x.toFixed(3));

function summary(t: Tally) {
  return {
    persons: t.persons,
    clearRate: r3(t.clear / t.persons),
    clearWrong: t.clear ? r3(t.clearWrong / t.clear) : null,
    shown: t.shown,
    setCoverage: t.shown ? r3(t.hit / t.shown) : null,
    setSize: r3(mean(t.size)),
    setP90: p90(t.size),
    ownCoverage: t.shown ? r3(t.hitOwn / t.shown) : null,
    ownSize: r3(mean(t.sizeOwn)),
    fixedCoverage: t.shown ? r3(t.hitFixed / t.shown) : null,
    fixedSize: r3(mean(t.sizeFixed)),
    highest3Coverage: t.shown ? r3(t.hit3 / t.shown) : null,
  };
}

async function main() {
  for (const d of DATASETS.filter((x) => data.includes(x.key))) {
    const panel = parseSoc(await load(d.path, d.sha256));
    const n = panel.names.length;
    const ids = panel.names.map((_, i) => `alt-${i}`);
    if (!(people >= 10 && people < panel.orders.length)) throw new Error(`--people must be 10..${panel.orders.length - 1}`);
    for (const lapse of lapses) {
      for (const sel of selectors) {
        for (const k of perItem) {
          const tallies = { top: blank(), bottom: blank() };
          const phis: { pooled: number[]; own: number[] } = { pooled: [], own: [] };
          for (let s = 1; s <= seeds; s++) {
            const rand = mulberry32(s * 104729 + k * 131 + Math.round(lapse * 1000) + (sel === "staged" ? 7 : 0));
            const drawn = panel.orders.map((o, i) => ({ o, key: rand(), i })).sort((x, y) => x.key - y.key || x.i - y.i).slice(0, people).map((x) => x.o);
            const persons = drawn.map((order) => ({ order, answers: answerWithHistory(order, k * n, sel, rand, lapse).answers }));
            const pooled = pooledPriorPhi(persons.map((p) => ({ ids, answers: p.answers })));
            phis.pooled.push(pooled);
            const stored = { phi: pooled, respondents: persons.length, answers: persons.length * k * n };
            for (const p of persons) {
              const answered = [...new Set(p.answers.flatMap((a) => [a.winner, a.loser]))];
              const fit = refitRatings(answered, p.answers);
              const own = empiricalPriorPhi(answered, p.answers);
              phis.own.push(own);
              const setFit = refitRatings(answered, p.answers, { priorPhi: setPriorPhi(own, stored) });
              const ownFit = refitRatings(answered, p.answers, { priorPhi: own });
              const ranked = answered.map((id) => ({ id, rating: fit.rating.get(id)! }));
              const sd = (a: { id: string }, b: { id: string }) => GLICKO_SCALE * differenceSd(fit, a.id, b.id);
              const covOf = (f: typeof fit) => (a: { id: string }, b: { id: string }) => GLICKO_SCALE * GLICKO_SCALE * f.cov[f.ids.indexOf(a.id) * f.ids.length + f.ids.indexOf(b.id)];
              const scoreOf = (f: typeof fit) => (x: { id: string }) => f.rating.get(x.id)!;
              for (const side of ["top", "bottom"] as const) {
                const bottom = side === "bottom";
                const truth = `alt-${bottom ? p.order[n - 1] : p.order[0]}`;
                const t = tallies[side];
                t.persons++;
                const pick = clearPick(ranked, sd, { bottom })!;
                if (pick.clear) {
                  t.clear++;
                  if (pick.leader.id !== truth) t.clearWrong++;
                  continue;
                }
                t.shown++;
                const set = contenders(ranked, covOf(setFit), { bottom, score: scoreOf(setFit) }).map((x) => x.id);
                const ownSet = contenders(ranked, covOf(ownFit), { bottom, score: scoreOf(ownFit) }).map((x) => x.id);
                const fixedSet = contenders(ranked, covOf(fit), { bottom }).map((x) => x.id);
                const three = [...ranked].sort((a, b) => (bottom ? a.rating - b.rating : b.rating - a.rating)).slice(0, 3).map((x) => x.id);
                t.hit += set.includes(truth) ? 1 : 0;
                t.size.push(set.length);
                t.hitOwn += ownSet.includes(truth) ? 1 : 0;
                t.sizeOwn.push(ownSet.length);
                t.hitFixed += fixedSet.includes(truth) ? 1 : 0;
                t.sizeFixed.push(fixedSet.length);
                t.hit3 += three.includes(truth) ? 1 : 0;
              }
            }
          }
          const sorted = [...phis.own].sort((a, b) => a - b);
          console.log(JSON.stringify({
            data: d.key, items: n, people, perItem: k, answers: k * n, selector: sel, lapse, seeds,
            pooledPhi: { min: r3(Math.min(...phis.pooled)), median: r3([...phis.pooled].sort((a, b) => a - b)[Math.floor(phis.pooled.length / 2)]), max: r3(Math.max(...phis.pooled)) },
            ownPhi: { p10: r3(sorted[Math.floor(0.1 * (sorted.length - 1))]), median: r3(sorted[Math.floor(0.5 * (sorted.length - 1))]), p90: r3(sorted[Math.floor(0.9 * (sorted.length - 1))]) },
            top: summary(tallies.top),
            bottom: summary(tallies.bottom),
          }));
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
