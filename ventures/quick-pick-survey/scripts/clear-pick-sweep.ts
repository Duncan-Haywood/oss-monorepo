/**
 * The insights screen's "clear top pick" claim at several thresholds
 * (src/lib/clearPick.ts). Synthetic respondent of src/lib/infoGainSim.ts,
 * honest unless --lapses says otherwise. For each selector and z, the share of
 * respondents the claim fires for and the share of claims naming an item that
 * is not the respondent's true favourite, pooled over list lengths and budgets.
 * "half" is the rule the route used until 2026-11-12 (ahead of the runner-up by
 * more than half the leader's rd, Glicko). z rules use the refit's covariance
 * (src/lib/btRefit.ts); "-next" compares with the runner-up only, otherwise
 * with every item.
 *
 *   npx tsx scripts/clear-pick-sweep.ts [--seeds 60] [--seed-base 1000] [--items 8,15,30] [--per-item 2,4,8] [--lapses 0] [--z 0.5,1,1.645,2.326] [--spread 1]
 *
 * --spread s draws true preferences uniform on [-s, s] (1 is the shared
 * respondent; 2 gives a respondent with much stronger likes and dislikes).
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { GLICKO_SCALE } from "../src/lib/glicko2";
import { refitRatings } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "60"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const lapses = opt("--lapses", "0").split(",").map(Number);
const zs = opt("--z", "0.5,1,1.645,2.326").split(",").map(Number);
const spread = Number(opt("--spread", "1"));
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

for (const lapse of lapses) {
  for (const sel of Object.keys(SELECTORS)) {
    const tally = new Map<string, { n: number; wrong: number }>();
    let total = 0;
    const add = (k: string, got: string | undefined, top: string) => {
      const t = tally.get(k) ?? { n: 0, wrong: 0 };
      if (got) { t.n++; if (got !== top) t.wrong++; }
      tally.set(k, t);
    };
    for (const items of itemCounts) {
      for (const k of perItem) {
        for (const s of seeds) {
          const r = simulate(SELECTORS[sel], items, k * items, s, lapse, 0, 0, false, undefined, 0, undefined, (_i, d) => d * spread);
          const ids = [...r.truth.keys()];
          const n = ids.length;
          const truth = ids.map((id) => r.truth.get(id)!);
          const top = ids[truth.indexOf(Math.max(...truth))];
          total++;
          const order = [...ids].sort((a, b) => r.states.get(b)!.rating - r.states.get(a)!.rating);
          const [a, b] = [r.states.get(order[0])!, r.states.get(order[1])!];
          add("half", a.rating - b.rating > 0.5 * a.rd ? order[0] : undefined, top);
          const fit = refitRatings(ids, r.history.map(({ picked, other }) => ({ winner: picked, loser: other })));
          const c = ids.map((id, i) => ({ key: id, rating: fit.rating.get(id)!, i }));
          const sd = (x: (typeof c)[number], y: (typeof c)[number]) =>
            GLICKO_SCALE * Math.sqrt(Math.max(0, fit.cov[x.i * n + x.i] + fit.cov[y.i * n + y.i] - 2 * fit.cov[x.i * n + y.i]));
          for (const z of zs) {
            const p = clearPick(c, sd, { z });
            add(`z${z}`, p?.clear ? p.leader.key : undefined, top);
            const ranked = [...c].sort((x, y) => y.rating - x.rating);
            const p2 = clearPick(ranked.slice(0, 2), sd, { z });
            add(`z${z}-next`, p2?.clear ? p2.leader.key : undefined, top);
          }
        }
      }
    }
    const row: Record<string, unknown> = { selector: sel, lapse, spread, respondents: total };
    for (const [k, t] of tally) row[k] = [Number((t.n / total).toFixed(3)), Number((t.n ? t.wrong / t.n : 0).toFixed(3))];
    console.log(JSON.stringify(row));
  }
}
