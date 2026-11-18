/**
 * A Glicko-2 update with a lapse term (src/lib/glicko2.ts, `lapse`): the
 * update assumes a share e of answers are coin flips, so a win has chance
 * e/2 + (1 - e) p and a careless answer no longer tightens rd as much as a
 * careful one. Synthetic respondent of src/lib/infoGainSim.ts. For each list
 * length, true lapse rate and budget (answers per item), prints mean rank
 * accuracy and 95% pairwise-interval coverage for each selector and each
 * assumed lapse ("=true" uses the respondent's real rate, which the survey
 * cannot know: it is the ceiling for a fixed e).
 *
 * --couple-bar instead prints the median and p90 answer count at which a
 * respondent first has min(8, items) items under rd 200 (the couple screen's
 * bar, src/lib/couples.ts), the cost of rd shrinking more slowly.
 *
 * "est" (and "est-map", "est-b<B>") reads e per respondent before each answer
 * from their own answers (src/lib/lapseEstimate.ts: grid posterior mean, mode,
 * or a Beta(1, B) prior); --estimates prints the mean and spread of the final
 * estimate for each true lapse instead. A "-in" suffix scores each answer with
 * the current ratings (in-sample) instead of the ratings just before it; an
 * "-oracle" suffix with the respondent's true win chance (the ceiling); a
 * "-point" suffix with the point ratings just before it, rd ignored.
 *
 *   npx tsx scripts/lapse-update-sweep.ts [--seeds 30] [--seed-base 1000] [--items 8,15,30] [--lapses 0,0.1,0.2,0.35,0.5] [--per-item 2,4,8] [--assumed 0,0.05,0.1,0.2,true] [--selectors shipped,staged] [--couple-bar] [--estimates] [--information]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type LapseSource, type Policy } from "../src/lib/infoGainSim";
import { DEFAULT_PRIOR_B, estimateLapse } from "../src/lib/lapseEstimate";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "30"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const lapses = opt("--lapses", "0,0.1,0.2,0.35,0.5").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const assumed = opt("--assumed", "0,0.05,0.1,0.2,true").split(",");
const selectorNames = opt("--selectors", "shipped,staged").split(",");
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
  // Uniform random pair: the design that spreads questions over far and close pairs.
  random: ({ items, rand }) => {
    const r = rand ?? Math.random;
    const a = Math.floor(r() * items.length);
    let b = Math.floor(r() * (items.length - 1));
    if (b >= a) b++;
    return [items[a].id, items[b].id];
  },
};

const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];

/** A fixed share, the respondent's true one, or a per-respondent estimate. */
function updateFor(a: string, lapse: number): number | LapseSource {
  if (a === "true") return Math.min(lapse, 0.95);
  if (a.startsWith("est")) {
    const summary = a.startsWith("est-map") ? "map" : "mean";
    const priorB = a.startsWith("est-b") ? parseInt(a.slice(5), 10) : DEFAULT_PRIOR_B;
    const inSample = a.endsWith("-in");
    const f: LapseSource = (answers, states) => estimateLapse(inSample ? answers.map(({ picked, other }) => ({ picked, other })) : answers, states, { summary, priorB });
    if (a.endsWith("-oracle")) f.oracle = true;
    if (a.endsWith("-point")) f.point = true;
    return f;
  }
  return Number(a);
}

// --information: mean Fisher information about e in one answer, at the
// respondent's true lapse, from the true win chance of each pair asked:
// (1/2 - p)^2 / (q (1 - q)), q = e/2 + (1 - e) p. The sd of any estimate of e
// from n such answers is at least 1 / sqrt(n * mean). Printed with that bound.
if (argv.includes("--information")) {
  for (const items of itemCounts) {
    for (const lapse of lapses) {
      for (const k of perItem) {
        const cell: Record<string, unknown> = { items, lapse, perItem: k };
        for (const sel of selectorNames) {
          const per: number[] = [];
          for (const s of seeds) {
            let seen: readonly { p?: number }[] = [];
            const spy: LapseSource = (answers) => ((seen = answers), 0);
            spy.oracle = true;
            simulate(SELECTORS[sel], items, k * items, s, lapse, 0, 0, false, undefined, spy);
            const info = seen.map(({ p = 0.5 }) => {
              const qq = lapse / 2 + (1 - lapse) * p;
              return (0.5 - p) ** 2 / (qq * (1 - qq));
            });
            per.push(mean(info));
          }
          const m = mean(per);
          cell[sel] = [Number(m.toFixed(4)), Number((1 / Math.sqrt(m * (k * items - 1))).toFixed(3))];
        }
        console.log(JSON.stringify(cell));
      }
    }
  }
  process.exit(0);
}

if (argv.includes("--estimates")) {
  for (const items of itemCounts) {
    for (const lapse of lapses) {
      for (const k of perItem) {
        const cell: Record<string, unknown> = { items, lapse, perItem: k };
        for (const sel of selectorNames) {
          for (const a of assumed.filter((x) => x.startsWith("est"))) {
            const finals: number[] = [];
            for (const s of seeds) {
              let last = 0;
              simulate(SELECTORS[sel], items, k * items, s, lapse, 0, 0, false, undefined, updateFor(a, lapse), (_n, e) => (last = e));
              finals.push(last);
            }
            cell[`${sel} ${a}`] = [Number(mean(finals).toFixed(3)), Number(q(finals, 0.1).toFixed(3)), Number(q(finals, 0.9).toFixed(3))];
          }
        }
        console.log(JSON.stringify(cell));
      }
    }
  }
  process.exit(0);
}

if (argv.includes("--couple-bar")) {
  for (const items of itemCounts) {
    for (const lapse of lapses) {
      const need = Math.min(8, items);
      const cap = Math.max(300, 8 * items);
      const cell: Record<string, unknown> = { items, lapse };
      for (const sel of selectorNames) {
        for (const a of assumed) {
          const e = updateFor(a, lapse);
          const reached: number[] = [];
          for (const s of seeds) {
            let at = Infinity;
            simulate(SELECTORS[sel], items, cap, s, lapse, 0, 0, false, (answered, rds) => {
              if (at === Infinity && rds.filter((rd) => rd < 200).length >= need) at = answered;
            }, e);
            reached.push(at);
          }
          cell[`${sel} e=${a}`] = [q(reached, 0.5), q(reached, 0.9)].map((x) => (x === Infinity ? `>${cap}` : x));
        }
      }
      console.log(JSON.stringify(cell));
    }
  }
  process.exit(0);
}

for (const items of itemCounts) {
  for (const lapse of lapses) {
    for (const k of perItem) {
      const budget = k * items;
      const cell: Record<string, unknown> = { items, lapse, perItem: k };
      for (const sel of selectorNames) {
        for (const a of assumed) {
          const e = updateFor(a, lapse);
          const acc: number[] = [], cov: number[] = [];
          for (const s of seeds) {
            const r = simulate(SELECTORS[sel], items, budget, s, lapse, 0, 0, false, undefined, e);
            acc.push(r.rankAccuracy);
            cov.push(r.coverage95);
          }
          cell[`${sel} e=${a}`] = [Number(mean(acc).toFixed(3)), Number(mean(cov).toFixed(3))];
        }
      }
      console.log(JSON.stringify(cell));
    }
  }
}
