/**
 * Dot gain on real public-domain paintings (README, "Dot gain"). Not a test: it
 * downloads the images (the same nine as eval/index-paintings.mjs).
 *
 *   node eval/index-gain.mjs [outdir]
 *
 * For each painting, garment and true gain: the plain index print and the print
 * compensated for an assumed gain, both rendered through the spread model at
 * the true gain, compared with the painting at 1 and 3 m. Assumed gains include
 * wrong guesses (half and double the truth) to show what a bad guess costs.
 * Needs the `playwright` package and a Chromium. No image is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { separate } from "../separation.mjs";
import { indexSeparate, perceivedDeltaE, sigmaAt } from "../indexsep.mjs";
import { PAINTINGS } from "./index-paintings.mjs";

const RUNS = [["#ffffff", 4], ["#1b1b1d", 4]];
const TRUE_GAINS = [15, 30];

const out = process.argv[2] || "index-gain";
fs.mkdirSync(out, { recursive: true });
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
const images = {};
for (const [name, url] of PAINTINGS) {
  const res = await fetch(url);
  if (!res.ok) { console.log(`${name}: ${res.status}, skipped`); continue; }
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  const r = await page.evaluate(async src => {
    const im = new Image(); im.src = src; await im.decode();
    const s = Math.min(1, 640 / Math.max(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h);
    return { w, h, d: Array.from(x.getImageData(0, 0, w, h).data) };
  }, `data:image/jpeg;base64,${b64}`);
  images[name] = { data: new Uint8ClampedArray(r.d), width: r.w, height: r.h };
}
await browser.close();
const rows = [];
for (const [garment, k] of RUNS) for (const [name] of PAINTINGS) {
  const img = images[name]; if (!img) continue;
  const base = separate(img, { colours: k, garment, widthCm: 28 });
  const cache = new Map();
  const sep = g => { if (!cache.has(g)) cache.set(g, indexSeparate(img, base, { dotGainPct: g })); return cache.get(g); };
  for (const truth of TRUE_GAINS) {
    const row = { painting: name, garment, inks: k, truth, dotMm: sep(0).dotMm };
    for (const assumed of [0, truth / 2, truth, truth * 2]) {
      const ix = sep(assumed);
      row[`a${assumed}`] = { m1: perceivedDeltaE(ix, ix.labels, sigmaAt(1), truth), m3: perceivedDeltaE(ix, ix.labels, sigmaAt(3), truth), ideal1: perceivedDeltaE(ix, ix.labels, sigmaAt(1), 0) };
    }
    rows.push(row);
    console.log(garment, truth, name.padEnd(24), [0, truth / 2, truth, truth * 2].map(a => `assume ${a}: 1m ${row[`a${a}`].m1} 3m ${row[`a${a}`].m3}`).join(" | "));
  }
}
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 1));
const mean = (rs, f) => +(rs.reduce((s, r) => s + f(r), 0) / rs.length).toFixed(2);
for (const [garment] of RUNS) for (const truth of TRUE_GAINS) {
  const rs = rows.filter(r => r.garment === garment && r.truth === truth);
  console.log(`MEAN ${garment} true ${truth}% (${rs.length} paintings):`, [0, truth / 2, truth, truth * 2].map(a => `assume ${a}: 1m ${mean(rs, r => r[`a${a}`].m1)} 3m ${mean(rs, r => r[`a${a}`].m3)} (better at 1m on ${rs.filter(r => r[`a${a}`].m1 < r.a0.m1).length})`).join(" | "));
}
