// Reads the SROIE receipt scans with tesseract.js, the WebAssembly reader the
// page's "Receipt photos" control loads (photoocr.mjs), so the page's own engine
// is measured rather than the tesseract binary the CLI calls. Writes
// <out>/psm6/<id>.txt and <out>/psm4/<id>.txt (each photo in both modes, as the
// page now reads it), skipping files already written so a stopped run resumes.
// Score with sroie-receipts.mjs:
//   node eval/sroie-receipts.mjs <clone>/data --ocr <out>/psm6            (one reading)
//   node eval/sroie-receipts.mjs <clone>/data --ocr <out>/psm6,<out>/psm4 (two readings)
// tesseract.js is not a dependency of this venture: install it anywhere with
// `npm install tesseract.js@5.1.1 @tesseract.js-data/eng@1.0.0` (the versions
// photoocr.mjs pins) and pass that folder's node_modules.
//   node eval/sroie-tesseractjs.mjs <clone>/data <out> <node_modules> [workers] [N]
import { readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const [dir, out, mods, nw = "4", limit = "100000"] = process.argv.slice(2);
if (!dir || !out || !mods) { console.error("usage: node eval/sroie-tesseractjs.mjs <clone>/data <out> <node_modules> [workers] [N]"); process.exit(2); }
const require = createRequire(join(resolve(mods), "noop.js"));
const T = require("tesseract.js");
// the page reads with the same model: @tesseract.js-data/eng@1.0.0/4.0.0, LSTM (oem 1)
const langPath = join(resolve(mods), "@tesseract.js-data/eng/4.0.0");
const MODES = { psm6: "6", psm4: "4" };
for (const m of Object.keys(MODES)) mkdirSync(join(out, m), { recursive: true });

const ids = readdirSync(join(dir, "img")).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)).sort().slice(0, +limit);
const todo = ids.filter((id) => Object.keys(MODES).some((m) => !existsSync(join(out, m, `${id}.txt`))));
console.log(`${ids.length} scans, ${todo.length} to read, ${nw} workers`);
let next = 0, done = 0;
const t0 = Date.now();
async function run() {
  const w = await T.createWorker("eng", 1, { langPath, cacheMethod: "none" });
  try {
    while (next < todo.length) {
      const id = todo[next++];
      for (const [m, psm] of Object.entries(MODES)) {
        const f = join(out, m, `${id}.txt`);
        if (existsSync(f)) continue;
        await w.setParameters({ tessedit_pageseg_mode: psm });
        writeFileSync(f, (await w.recognize(join(dir, "img", `${id}.jpg`))).data.text);
      }
      if (++done % 25 === 0) console.log(`${done}/${todo.length} in ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  } finally { await w.terminate(); }
}
await Promise.all(Array.from({ length: +nw }, run));
console.log(`done: ${done} in ${Math.round((Date.now() - t0) / 1000)} s`);
