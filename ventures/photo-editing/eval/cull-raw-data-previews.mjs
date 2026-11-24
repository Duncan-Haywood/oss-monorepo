// The cull page's raw-data previews (site/rawmosaic.mjs) on a folder of DNGs.
// For each .dng with no embedded JPEG preview (site/rawpreview.mjs), decodes
// the CFA image, writes its sensels to OUT/<name>.u16 (little-endian, row-major)
// and the developed preview to OUT/<name>.ppm, and prints one TSV row.
// The sensels are compared with shootflow's own reader by
// eval/cull-raw-data-previews-check.py.
//   node eval/cull-raw-data-previews.mjs DIR... OUT > report.tsv
import fs from "node:fs";
import path from "node:path";
import { readRaw } from "../site/rawpreview.mjs";
import { findMosaic, decodeMosaic, developMosaic } from "../site/rawmosaic.mjs";

const args = process.argv.slice(2);
const out = args.pop();
fs.mkdirSync(out, { recursive: true });
const files = [];
for (const d of args) {
  for (const f of fs.readdirSync(d).sort()) if (/\.dng$/i.test(f)) files.push(path.join(d, f));
}
console.log(["file", "make", "model", "embedded_preview", "compression", "sensor", "decode_ms", "preview", "develop_ms", "gain", "baseline_ev", "illuminant", "notes"].join("\t"));
for (const f of files) {
  const b = new Uint8Array(fs.readFileSync(f));
  const r = readRaw(b, f);
  const m = findMosaic(b);
  const row = [path.basename(f), r.meta.make || "", r.meta.model || "", r.preview ? `${r.preview.width}x${r.preview.height}` : "none"];
  if (!m) { console.log([...row, "", "", "", "no CFA image", "", "", "", "", ""].join("\t")); continue; }
  try {
    const comp = m.one(m.raw, 259, 1);
    let t0 = performance.now();
    const mos = decodeMosaic(m);
    const dms = performance.now() - t0;
    const stem = path.basename(f).replace(/\.dng$/i, "");
    fs.writeFileSync(path.join(out, stem + ".u16"), Buffer.from(mos.data.buffer));
    t0 = performance.now();
    const p = developMosaic(b, { found: m });
    const pms = performance.now() - t0;
    const rgb = Buffer.alloc(p.width * p.height * 3);
    for (let i = 0, j = 0; i < p.rgba.length; i += 4, j += 3) { rgb[j] = p.rgba[i]; rgb[j + 1] = p.rgba[i + 1]; rgb[j + 2] = p.rgba[i + 2]; }
    fs.writeFileSync(path.join(out, stem + ".ppm"), Buffer.concat([Buffer.from(`P6\n${p.width} ${p.height}\n255\n`), rgb]));
    fs.writeFileSync(path.join(out, stem + ".json"), JSON.stringify({ file: f, width: mos.width, height: mos.height, orientation: r.meta.orientation, area: p.area, gain: p.gain, wb: p.wb }));
    console.log([...row, comp === 7 ? "lossless JPEG" : comp === 1 ? "uncompressed" : comp, `${mos.width}x${mos.height}`, dms.toFixed(0), `${p.width}x${p.height}`, pms.toFixed(0), p.gain.toFixed(2), p.baselineExposure.toFixed(2), p.illuminant, p.notes.join("; ")].join("\t"));
  } catch (e) {
    console.log([...row, "", "", "", `error: ${e.message}`, "", "", "", "", ""].join("\t"));
  }
}
