// Reads photos with rapidocr-web.mjs (the page's RapidOCR port) in Node, so its readings can
// be scored against the Python engine's (rapidocr_rows.py) on the same photos.
//   npm i onnxruntime-web@1.20.1 jpeg-js@0.4.4 @gutenye/ocr-models@1.4.2   (in <node_modules>'s parent)
//   node eval/rapidocr-web.mjs <photos dir> <out dir> <node_modules> [--node]
// Writes <out>/<id>.txt (rows, as rapidocr_rows.py prints them) and <out>/<id>.json (boxes).
// --node runs the models with onnxruntime-node instead of onnxruntime-web's WebAssembly.
// Score: node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <out>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createRapidOcr, rapidRows, bgrFromRgba } from "../rapidocr-web.mjs";

const [src, out, nm] = process.argv.slice(2);
if (!nm) { console.error("usage: node eval/rapidocr-web.mjs <photos> <out> <node_modules> [--node]"); process.exit(2); }
const req = createRequire(join(nm, "x.js"));
const ort = process.argv.includes("--node") ? req("onnxruntime-node") : req("onnxruntime-web");
const jpeg = req("jpeg-js");
const assets = join(nm, "@gutenye/ocr-models/assets");
const engine = createRapidOcr({
  ort,
  models: Object.fromEntries(Object.entries({ det: "ch_PP-OCRv4_det_infer", cls: "ch_ppocr_mobile_v2.0_cls_infer", rec: "ch_PP-OCRv4_rec_infer" }).map(([k, f]) => [k, new Uint8Array(readFileSync(join(assets, `${f}.onnx`)))])),
  keys: readFileSync(join(assets, "ppocr_keys_v1.txt"), "utf8"),
});
mkdirSync(out, { recursive: true });
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
let n = 0; const t0 = Date.now();
for (const f of readdirSync(src).filter((f) => /\.jpe?g$/i.test(f)).sort()) {
  const id = f.replace(/\.[^.]+$/, "");
  if (only && !only.split(",").includes(id)) continue;
  let im;
  try { im = jpeg.decode(readFileSync(join(src, f)), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 }); }
  catch (e) { console.error(`${id}: not read (${e.message}; jpeg-js reads JPEGs only)`); continue; }
  const res = await engine.read(bgrFromRgba(im.data, im.width, im.height));
  writeFileSync(join(out, `${id}.txt`), rapidRows(res));
  writeFileSync(join(out, `${id}.json`), JSON.stringify(res));
  n++;
}
console.log(`${n} photos in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
