// Does a capped try at a cap between the page's two capped tries and its weighted ones add a
// season to the frontier (no other try has both less carry-over and fewer breaks)? The page runs
// 8 weighted + 2 capped tries (carryOverTry 0-9); this runs those plus capped tries 10-13 (caps
// cappedTryBreaks j = 2-5, the same sequence one step on) and reports, per size and seed, the
// page's frontier, what the extra tries reach, and the widest break gap left between two frontier
// seasons before and after.
//
//   node eval/frontier-gap.mjs --sizes 17,19 --seeds 1,2,3 [--single] [--extra 4]
//
// One JSON line per (size, seed); eval/frontier-gap.txt holds the run behind the README section.
import { fileURLToPath } from "node:url";
import { carryOverTry, combineCarryOverTries, carryOverDistinct } from "../carryover.mjs";

export const PAGE = { weighted: 8, capped: 2 };

/** Non-dominated {coe, breaks, index} among the candidates, by carry-over. */
export function frontierOf(c) {
  return c.filter((x) => !c.some((y) => y.coe <= x.coe && y.breaks <= x.breaks && (y.coe < x.coe || y.breaks < x.breaks)))
    .filter((x, i, a) => a.findIndex((y) => y.coe === x.coe && y.breaks === x.breaks) === i)
    .sort((a, b) => a.coe - b.coe || a.breaks - b.breaks);
}
const widestGap = (f) => f.reduce((g, x, i) => (i ? Math.max(g, f[i - 1].breaks - x.breaks) : 0), 0);

export function probe(n, seed, { double = true, extra = 4 } = {}) {
  const t0 = Date.now();
  const res = [];
  for (let i = 0; i < PAGE.weighted + PAGE.capped + extra; i++) res.push(carryOverTry(n, i, { double, seed, weighted: PAGE.weighted }));
  const ms = Date.now() - t0;
  const cand = res.map((t) => ({ index: t.index, coe: t.coe, breaks: t.breaks, maxBreaks: t.maxBreaks ?? null }));
  const page = frontierOf(cand.slice(0, PAGE.weighted + PAGE.capped));
  const all = frontierOf(cand);
  const added = all.filter((x) => x.index >= PAGE.weighted + PAGE.capped);
  return {
    teams: n, double, seed,
    page: page.map((x) => `${x.coe}/${x.breaks}`), all: all.map((x) => `${x.coe}/${x.breaks}${x.index >= 10 ? "*" : ""}`),
    extra: cand.slice(PAGE.weighted + PAGE.capped).map((x) => `${x.coe}/${x.breaks} (cap ${x.maxBreaks})`),
    added: added.length, gapBefore: widestGap(page), gapAfter: widestGap(all),
    distinctPage: carryOverDistinct(cand.slice(0, 10)),
    s: +(ms / 1000).toFixed(1),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(",").map(Number) : d; };
  const double = !process.argv.includes("--single");
  const [extra] = arg("--extra", [4]);
  for (const n of arg("--sizes", [17, 18, 19, 20])) for (const seed of arg("--seeds", [1, 2, 3])) console.log(JSON.stringify(probe(n, seed, { double, extra })));
}
