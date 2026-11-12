/**
 * Does the insights card's "it's between X, Y, Z" list hold the person's true
 * favourite? Compares the list the route showed until 2026-11-12 (the three
 * highest-rated items) with the refit's credible set (src/lib/favouriteSet.ts)
 * at several levels, on the synthetic respondent of src/lib/infoGainSim.ts.
 * Counted only for respondents whose card says "too close to call" (the
 * clear-pick rule, src/lib/clearPick.ts, does not fire): that is when the
 * list is shown. Per selector: how often the list holds the true favourite
 * (coverage), its mean and 90th-percentile length.
 *
 *   npx tsx scripts/favourite-set-sweep.ts [--seeds 60] [--seed-base 1000] [--items 8,15,30] [--per-item 2,4,8] [--lapses 0] [--levels 0.8,0.9,0.95] [--spread 1] [--bottom]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { GLICKO_SCALE } from "../src/lib/glicko2";
import { refitRatings, empiricalPriorPhi } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";
import { favouriteSet } from "../src/lib/favouriteSet";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "60"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const lapses = opt("--lapses", "0").split(",").map(Number);
const levels = opt("--levels", "0.8,0.9,0.95").split(",").map(Number);
const spread = Number(opt("--spread", "1"));
const bottom = argv.includes("--bottom");
const priorPhis = opt("--prior-phi", "").split(",").filter(Boolean).map(Number);
const byCell = argv.includes("--by-cell");
const eb = argv.includes("--eb");
const ebPhis: number[] = [];
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(0.9 * (xs.length - 1))] ?? 0;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

for (const lapse of lapses) {
  for (const sel of Object.keys(SELECTORS)) {
    const cells: { items: number; perItem: number; tally: Map<string, { hit: number[]; size: number[] }>; shown: number; total: number }[] = [];
    for (const items of itemCounts) {
      for (const k of perItem) {
        const tally = new Map<string, { hit: number[]; size: number[] }>();
        const add = (key: string, set: string[], truthTop: string) => {
          const t = tally.get(key) ?? { hit: [], size: [] };
          t.hit.push(set.includes(truthTop) ? 1 : 0);
          t.size.push(set.length);
          tally.set(key, t);
        };
        let shown = 0;
        for (const s of seeds) {
          const r = simulate(SELECTORS[sel], items, k * items, s, lapse, 0, 0, false, undefined, 0, undefined, (_i, d) => d * spread);
          const ids = [...r.truth.keys()];
          const n = ids.length;
          const truth = ids.map((id) => (bottom ? -1 : 1) * r.truth.get(id)!);
          const top = ids[truth.indexOf(Math.max(...truth))];
          const fit = refitRatings(ids, r.history.map(({ picked, other }) => ({ winner: picked, loser: other })));
          const c = ids.map((id, i) => ({ key: id, rating: fit.rating.get(id)!, i }));
          const sd = (x: (typeof c)[number], y: (typeof c)[number]) =>
            GLICKO_SCALE * Math.sqrt(Math.max(0, fit.cov[x.i * n + x.i] + fit.cov[y.i * n + y.i] - 2 * fit.cov[x.i * n + y.i]));
          if (clearPick(c, sd, { bottom })!.clear) continue;
          shown++;
          const ranked = [...c].sort((x, y) => (bottom ? x.rating - y.rating : y.rating - x.rating));
          add("highest3", ranked.slice(0, 3).map((x) => x.key), top);
          const meanPts = fit.mu.map((m) => GLICKO_SCALE * m);
          const covPts = fit.cov.map((v) => GLICKO_SCALE * GLICKO_SCALE * v);
          for (const level of levels) {
            const f = favouriteSet(meanPts, covPts, { level, bottom });
            add(`set${level}`, f.members.map((i) => ids[i]), top);
          }
          if (eb) {
            const answers = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
            const phi = empiricalPriorPhi(ids, answers);
            ebPhis.push(phi);
            const g = refitRatings(ids, answers, { priorPhi: phi });
            for (const level of levels) {
              const f = favouriteSet(g.mu, g.cov, { level, bottom });
              add(`set${level}@eb`, f.members.map((i) => ids[i]), top);
            }
            // Would the clear-pick rule, run on the EB refit, name the right item?
            const ce = ids.map((id, i) => ({ key: id, rating: g.mu[i], i }));
            const sdE = (x: (typeof ce)[number], y: (typeof ce)[number]) => Math.sqrt(Math.max(0, g.cov[x.i * n + x.i] + g.cov[y.i * n + y.i] - 2 * g.cov[x.i * n + y.i]));
            const pick = clearPick(ce, sdE, { bottom })!;
            add("ebClear", pick.clear ? ["fired"] : [], "fired");
            if (pick.clear) add("ebClearRight", [pick.leader.key], top);
          }
          for (const phi of priorPhis) {
            const g = refitRatings(ids, r.history.map(({ picked, other }) => ({ winner: picked, loser: other })), { priorPhi: phi });
            for (const level of levels) {
              const f = favouriteSet(g.mu, g.cov, { level, bottom });
              add(`set${level}@phi${phi}`, f.members.map((i) => ids[i]), top);
            }
          }
        }
        cells.push({ items, perItem: k, tally, shown, total: seeds.length });
      }
    }
    const summarise = (list: typeof cells) => {
      const out: Record<string, unknown> = {};
      const keys = new Set(list.flatMap((c) => [...c.tally.keys()]));
      for (const key of keys) {
        const hit = list.flatMap((c) => c.tally.get(key)?.hit ?? []);
        const size = list.flatMap((c) => c.tally.get(key)?.size ?? []);
        out[key] = { coverage: Number(mean(hit).toFixed(3)), meanSize: Number(mean(size).toFixed(2)), p90Size: p90(size) };
      }
      return out;
    };
    if (eb && ebPhis.length) {
      const sorted = [...ebPhis].sort((a, b) => a - b);
      const at = (p: number) => Number(sorted[Math.floor(p * (sorted.length - 1))].toFixed(2));
      console.log(JSON.stringify({ selector: sel, lapse, spread, ebPhi: { p10: at(0.1), median: at(0.5), p90: at(0.9), atMin: Number((sorted.filter((x) => x <= 0.3001).length / sorted.length).toFixed(3)), atMax: Number((sorted.filter((x) => x >= 2.0147).length / sorted.length).toFixed(3)) } }));
      ebPhis.length = 0;
    }
    if (byCell) for (const c of cells) console.log(JSON.stringify({ selector: sel, lapse, spread, bottom, items: c.items, perItem: c.perItem, shown: c.shown, of: c.total, ...summarise([c]) }));
    const shown = cells.reduce((a, c) => a + c.shown, 0);
    console.log(JSON.stringify({ selector: sel, lapse, spread, bottom, cell: "all", shown, of: cells.reduce((a, c) => a + c.total, 0), ...summarise(cells), worstCellCoverage: Object.fromEntries([...new Set(cells.flatMap((c) => [...c.tally.keys()]))].map((key) => [key, Math.min(...cells.filter((c) => c.tally.has(key)).map((c) => Number(mean(c.tally.get(key)!.hit).toFixed(3))))])) }));
  }
}
