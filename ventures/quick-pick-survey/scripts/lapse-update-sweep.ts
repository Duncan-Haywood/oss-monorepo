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
 *   npx tsx scripts/lapse-update-sweep.ts [--seeds 30] [--seed-base 1000] [--items 8,15,30] [--lapses 0,0.1,0.2,0.35,0.5] [--per-item 2,4,8] [--assumed 0,0.05,0.1,0.2,true] [--selectors shipped,staged] [--couple-bar]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";

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
};

const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];
if (argv.includes("--couple-bar")) {
  for (const items of itemCounts) {
    for (const lapse of lapses) {
      const need = Math.min(8, items);
      const cap = Math.max(300, 8 * items);
      const cell: Record<string, unknown> = { items, lapse };
      for (const sel of selectorNames) {
        for (const a of assumed) {
          const e = a === "true" ? Math.min(lapse, 0.95) : Number(a);
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
          const e = a === "true" ? Math.min(lapse, 0.95) : Number(a);
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
