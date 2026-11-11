/**
 * Flat spot inks against index dots on real public-domain paintings
 * (README, "Index separation"). Not a test: it downloads the images.
 *
 *   node eval/index-paintings.mjs [outdir]
 *
 * Images are fetched from public GitHub repositories (museum and API hosts
 * were blocked from the build session), decoded in headless Chromium's canvas
 * at up to 640 px (as the studio page did before 2026-11-11), separated with
 * `separate` at 28 cm wide, then index-separated and compared at 0.5, 1 and
 * 3 m. Needs the `playwright` package and a Chromium. No image is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { separate } from "../separation.mjs";
import { indexSeparate, compareFlatIndex } from "../indexsep.mjs";

const RAW = "https://raw.githubusercontent.com", LFS = "https://media.githubusercontent.com/media";
export const PAINTINGS = [
  ["starry_night", `${RAW}/jcjohnson/neural-style/master/examples/inputs/starry_night.jpg`, "Van Gogh, The Starry Night, 1889"],
  ["the_scream", `${RAW}/jcjohnson/neural-style/master/examples/inputs/the_scream.jpg`, "Munch, The Scream, 1893"],
  ["shipwreck", `${RAW}/jcjohnson/neural-style/master/examples/inputs/shipwreck.jpg`, "Turner, The Shipwreck of the Minotaur, c. 1810"],
  ["woman-with-hat-matisse", `${RAW}/jcjohnson/neural-style/master/examples/inputs/woman-with-hat-matisse.jpg`, "Matisse, Woman with a Hat, 1905"],
  ["wave", `${RAW}/lengstrom/fast-style-transfer/master/examples/style/wave.jpg`, "Hokusai, The Great Wave off Kanagawa, c. 1831"],
  ["udnie", `${RAW}/lengstrom/fast-style-transfer/master/examples/style/udnie.jpg`, "Picabia, Udnie, 1913"],
  ["sassoferrato_madonna", `${LFS}/FableVision/ami-st-gallen/master/art/Salvi%20Giovanni%20Battista_Madonna%20im%20Gebet.jpg`, "Sassoferrato, Madonna in Prayer, 17th c."],
  ["barocci", `${LFS}/FableVision/ami-st-gallen/master/art/BAROCCI%20Federico_G%202008.1_S%20Stadler%202013_mit%20Rahmen.jpg`, "Barocci (framed photograph), 16th c."],
  ["munch_madonna", `${LFS}/art-institute-of-chicago/static-archive/master/munch/images/Madonna.jpg`, "Munch, Madonna (184 x 250 px thumbnail)"],
];
export const RUNS = [["#ffffff", 3], ["#ffffff", 4], ["#ffffff", 6], ["#1b1b1d", 4]];

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || "index-paintings";
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
    const idx = indexSeparate(img, base);
    const cmp = compareFlatIndex(base, idx, [0.5, 1, 3]);
    rows.push({ painting: name, garment, inks: k, dotMm: idx.dotMm, cmp });
    console.log(garment, k, name.padEnd(24), cmp.map(c => `${c.metres} m flat ${c.flat} index ${c.index}`).join(" | "));
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 1));
}
