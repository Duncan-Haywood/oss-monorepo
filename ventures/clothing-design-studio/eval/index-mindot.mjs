/**
 * Minimum-dot cleanup (`cleanLoneDots`) on the nine public-domain paintings of `eval/index-paintings.mjs`
 * (README, "No single dots"). Not a test: it downloads the images (PAINTINGS_CACHE=dir keeps the pixels).
 *
 *   node eval/index-mindot.mjs [passes=3]
 *
 * Each painting is separated at 28 cm and index-separated with the flat inks, then scored at 0.5, 1 and 3 m:
 * - plain dots, on a press that holds single dots and on one that loses every single dot (`loseLoneDots`);
 * - cleaned (no single dots), with no search and with `passes` search passes judged at 1 m;
 * - the same search with single dots allowed, to show what the rule itself costs.
 */
import { separate } from "../separation.mjs";
import { indexSeparate, cleanLoneDots, loseLoneDots, countLoneDots, perceivedDeltaE, sigmaAt } from "../indexsep.mjs";
import { loadPaintings, PAINTINGS, RUNS } from "./index-paintings.mjs";

const DIST = [0.5, 1, 3];
const passes = Number(process.argv[2] ?? 3);
const images = await loadPaintings({ cacheDir: process.env.PAINTINGS_CACHE || "" });
const rows = [];
for (const [garment, k] of RUNS) for (const [name] of PAINTINGS) {
  const img = images[name]; if (!img) continue;
  const base = separate(img, { colours: k, garment, widthCm: 28 });
  const idx = indexSeparate(img, base);
  const score = labels => DIST.map(m => perceivedDeltaE(idx, labels, sigmaAt(m)));
  let t = Date.now();
  const c0 = cleanLoneDots(idx); const ms0 = Date.now() - t; t = Date.now();
  const cs = cleanLoneDots(idx, { passes }); const msS = Date.now() - t;
  const free = cleanLoneDots(idx, { passes, keepSingles: true });
  const row = {
    name, garment, k, cells: idx.width * idx.height, lonePct: +(100 * countLoneDots(idx) / idx.width / idx.height).toFixed(1),
    plain: score(idx.labels), plainLost: score(loseLoneDots(idx)), clean: score(c0.labels), cleanSearch: score(cs.labels),
    freeSearch: score(free.labels), freeSearchLost: score(loseLoneDots(idx, free.labels)), ms0, msS,
    left: countLoneDots(cs),
  };
  rows.push(row);
  console.log(garment, k, name.padEnd(24), `lone ${row.lonePct}%`, "plain", row.plain.join("/"), "lost", row.plainLost.join("/"), "| clean", row.clean.join("/"), `${ms0} ms`, "| clean+search", row.cleanSearch.join("/"), `${msS} ms`, "| search alone", row.freeSearch.join("/"), "lost", row.freeSearchLost.join("/"), "| left", row.left);
}
const groups = {};
for (const r of rows) (groups[`${r.garment}, ${r.k}`] ??= []).push(r);
const mean = (a, f) => (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(2);
const col = (a, key) => DIST.map((_, j) => mean(a, r => r[key][j])).join(" / ");
console.log(`\n| Garment, inks | Single dots | Plain dots | Plain, singles lost | No singles | No singles + ${passes} passes | Search alone | Search alone, singles lost | No singles + search closer than plain at 1 m |`);
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [g, a] of Object.entries(groups)) {
  const wins = a.filter(r => r.cleanSearch[1] < r.plain[1] - 0.005).length;
  console.log(`| ${g} | ${mean(a, r => r.lonePct)}% | ${col(a, "plain")} | ${col(a, "plainLost")} | ${col(a, "clean")} | ${col(a, "cleanSearch")} | ${col(a, "freeSearch")} | ${col(a, "freeSearchLost")} | ${wins} of ${a.length} |`);
}
console.log(`\nSingle dots left after cleanup + search: ${rows.reduce((s, r) => s + r.left, 0)} in ${rows.length} runs. Time per run (median): cleanup ${rows.map(r => r.ms0).sort((a, b) => a - b)[rows.length >> 1]} ms, with search ${rows.map(r => r.msS).sort((a, b) => a - b)[rows.length >> 1]} ms.`);
