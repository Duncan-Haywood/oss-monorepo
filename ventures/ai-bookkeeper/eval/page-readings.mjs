// Lays out the four readings the page makes of each photo, in the page's order, so
// eval/cord-receipts.mjs and eval/sroie-receipts.mjs can score them with --settled:
//   node eval/page-readings.mjs <shading.json> <ocr> <ocr2> <ocrS> <ocr2S> <out>
// <shading.json> is eval/canvas-shading.mjs's output; <ocr> and <ocr2> are
// eval/sroie-tesseractjs.mjs's readings of the photos and of the grey copies
// (eval/srd-canvas-grow.mjs), each with psm6/ and psm4/; <ocrS> and <ocr2S> the same
// with `--modes psm6 --set thresholding_method=2` (only shaded photos need them).
// A photo at or over SHADED_CUT takes SHADED_PASSES, any other PASSES
// (photoocr.mjs); a photo 2,000 px or more on its long side has its grey copy's two
// readings first. A missing reading (no grey copy) is written empty. Writes
// <out>/r1 .. <out>/r4; then: `--ocr <out>/r1,<out>/r2,<out>/r3,<out>/r4 --settled`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { SHADED_CUT } from "../photoocr.mjs";

const [shadingFile, ocr, ocr2, ocrS, ocr2S, out] = process.argv.slice(2);
if (!out) { console.error("usage: node eval/page-readings.mjs <shading.json> <ocr> <ocr2> <ocrS> <ocr2S> <out>"); process.exit(2); }
const shading = JSON.parse(readFileSync(shadingFile, "utf8"));
const read = (dir, id) => (existsSync(`${dir}/${id}.txt`) ? readFileSync(`${dir}/${id}.txt`, "utf8") : "");
for (let i = 1; i <= 4; i++) mkdirSync(`${out}/r${i}`, { recursive: true });
let shaded = 0, big = 0;
for (const [id, s] of Object.entries(shading)) {
  const isShaded = s.spread >= SHADED_CUT, isBig = Math.max(s.w, s.h) >= 2000;
  shaded += isShaded; big += isBig;
  const photo = isShaded ? [`${ocr}/psm6`, `${ocrS}/psm6`] : [`${ocr}/psm6`, `${ocr}/psm4`];
  const copy = isShaded ? [`${ocr2}/psm6`, `${ocr2S}/psm6`] : [`${ocr2}/psm6`, `${ocr2}/psm4`];
  const dirs = isBig ? [...copy, ...photo] : [...photo, ...copy];
  dirs.forEach((d, i) => writeFileSync(`${out}/r${i + 1}/${id}.txt`, read(d, id)));
}
console.log(`${Object.keys(shading).length} photos: ${shaded} shaded, ${big} with the grey copy first`);
