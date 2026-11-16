/**
 * Inks from a printer's stock (`stockinks.mjs`) on the nine public-domain paintings of `eval/index-paintings.mjs`
 * (README, "Inks from the printer's stock"). Not a test: it downloads the images (PAINTINGS_CACHE=dir keeps them).
 *
 *   node eval/index-stock.mjs [outdir]
 *
 * For each garment and ink count, each painting is separated at 28 cm; then, at 1 m and 3 m: the flat inks dotted,
 * the nearest stock ink to each flat ink dotted (the pick by eye), `chooseStockInks` from STARTER_STOCK, and the
 * freely mixed inks of `chooseIndexInks` (what custom mixing buys on top of stock).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { separate } from "../separation.mjs";
import { indexSeparate, perceivedDeltaE, sigmaAt } from "../indexsep.mjs";
import { chooseIndexInks } from "../inkfit.mjs";
import { chooseStockInks, STARTER_STOCK } from "../stockinks.mjs";
import { loadPaintings, PAINTINGS, RUNS } from "./index-paintings.mjs";

const DIST = [1, 3];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] || "index-stock";
  fs.mkdirSync(out, { recursive: true });
  const images = await loadPaintings({ cacheDir: process.env.PAINTINGS_CACHE || "" });
  const rows = [];
  for (const [garment, k] of RUNS) for (const [name] of PAINTINGS) {
    const img = images[name]; if (!img) continue;
    const base = separate(img, { colours: k, garment, widthCm: 28 });
    const plain = indexSeparate(img, base);
    const row = { painting: name, garment, inks: k, at: {} };
    for (const m of DIST) {
      const sig = sigmaAt(m), t = Date.now();
      const st = chooseStockInks(img, base, STARTER_STOCK, { metres: m });
      const ms = Date.now() - t;
      const free = chooseIndexInks(img, base, { metres: m });
      row.at[m] = { flatInks: perceivedDeltaE(plain, plain.labels, sig), nearest: st.nearestDeltaE, stock: st.candidates.reduce((a, c) => Math.min(a, c.deltaE), Infinity),
        free: free.candidates.reduce((a, c) => Math.min(a, c.deltaE), Infinity), names: st.names, winner: st.candidates.find(c => c.inks.join() === st.inks.join()).label, ms, evaluations: st.evaluations };
    }
    rows.push(row);
    console.log(garment, k, name.padEnd(24), DIST.map(m => { const a = row.at[m]; return `${m} m: flat inks ${a.flatInks} | nearest stock ${a.nearest} | chosen stock ${a.stock} (${a.names.join(", ")}; ${a.ms} ms) | mixed ${a.free}`; }).join(" || "));
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 1));
  const groups = {};
  for (const r of rows) (groups[`${r.garment} ${r.inks}`] ??= []).push(r);
  const mean = (a, f) => (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(2);
  console.log("\n| Garment, inks | m | index, flat inks | nearest stock | chosen stock | freely mixed | chosen beats nearest |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [g, a] of Object.entries(groups)) for (const m of DIST)
    console.log(`| ${g} | ${m} | ${mean(a, r => r.at[m].flatInks)} | ${mean(a, r => r.at[m].nearest)} | ${mean(a, r => r.at[m].stock)} | ${mean(a, r => r.at[m].free)} | ${a.filter(r => r.at[m].stock < r.at[m].nearest - 0.005).length} of ${a.length} |`);
}
