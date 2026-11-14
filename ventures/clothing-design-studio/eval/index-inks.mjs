/**
 * Inks chosen for the dither (`inkfit.mjs`) against the flat separation's inks, on the nine public-domain
 * paintings of `eval/index-paintings.mjs` (README, "Inks chosen for the dots"). Not a test: it downloads the
 * images (set PAINTINGS_CACHE=dir to keep the decoded pixels between runs).
 *
 *   node eval/index-inks.mjs [outdir]
 *
 * For each garment and ink count, each painting is separated at 28 cm, then `chooseIndexInks` picks inks for
 * 0.5, 1 and 3 m. Every pick is then scored at all three distances, so the table shows what choosing for one
 * distance costs at the others.
 */
import fs from "node:fs";
import path from "node:path";
import { separate } from "../separation.mjs";
import { indexSeparate, compareFlatIndex } from "../indexsep.mjs";
import { chooseIndexInks } from "../inkfit.mjs";
import { loadPaintings, PAINTINGS, RUNS } from "./index-paintings.mjs";

const DIST = [0.5, 1, 3];
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || "index-inks";
  fs.mkdirSync(out, { recursive: true });
  const images = await loadPaintings({ cacheDir: process.env.PAINTINGS_CACHE || "" });
  const rows = [];
  for (const [garment, k] of RUNS) for (const [name] of PAINTINGS) {
    const img = images[name]; if (!img) continue;
    const base = separate(img, { colours: k, garment, widthCm: 28 });
    const plain = compareFlatIndex(base, indexSeparate(img, base), DIST);
    const row = { painting: name, garment, inks: k, flat: plain.map(c => c.flat), index: plain.map(c => c.index), chosen: {} };
    for (const m of DIST) {
      const t = Date.now();
      const pick = chooseIndexInks(img, base, { metres: m });
      row.chosen[m] = { inks: pick.inks, refit: pick.refit, ms: Date.now() - t, at: compareFlatIndex(base, pick.idx, DIST).map(c => c.index), candidates: pick.candidates };
    }
    rows.push(row);
    console.log(garment, k, name.padEnd(24), "flat", row.flat.join("/"), "| index", row.index.join("/"), "|", DIST.map(m => `for ${m} m: ${row.chosen[m].at.join("/")}${row.chosen[m].refit ? "" : " (flat inks kept)"} ${row.chosen[m].ms} ms`).join(" | "));
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 1));
  // summary: mean delta E per garment/ink count at each distance, and how often the pick beats plain index
  const groups = {};
  for (const r of rows) (groups[`${r.garment} ${r.inks}`] ??= []).push(r);
  const mean = (a, f) => (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(2);
  console.log("\n| Garment, inks | flat 0.5/1/3 m | index, flat inks | inks for 0.5 m | inks for 1 m | inks for 3 m | closer than index, flat inks (at its own distance) |");
  for (const [g, a] of Object.entries(groups)) {
    const cols = [DIST.map((_, j) => mean(a, r => r.flat[j])).join(" / "), DIST.map((_, j) => mean(a, r => r.index[j])).join(" / "),
      ...DIST.map(m => DIST.map((_, j) => mean(a, r => r.chosen[m].at[j])).join(" / "))];
    const wins = DIST.map((m, j) => `${a.filter(r => r.chosen[m].at[j] < r.index[j] - 0.005).length}`).join(" / ");
    console.log(`| ${g} | ${cols.join(" | ")} | ${wins} of ${a.length} |`);
  }
}
