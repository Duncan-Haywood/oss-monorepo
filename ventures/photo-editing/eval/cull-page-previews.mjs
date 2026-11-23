// Runs site/rawpreview.mjs over a folder of real camera raws and reports, per
// file, the preview it would show and the metadata it read. Writes the
// extracted JPEGs to OUT so a decoder (eval/cull-page-previews-decode.py,
// Pillow) can confirm each one decodes at the size the parser claims.
//
//   git clone --depth 1 --filter=blob:none --sparse \
//     https://github.com/drewnoakes/metadata-extractor-images.git mei
//   (cd mei && git sparse-checkout set arw cr2 cr3 dng nef orf pef raf rw2 srw nrw)
//   node eval/cull-page-previews.mjs mei OUT > report.tsv
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { readRaw, isCandidateFile } from "../site/rawpreview.mjs";

const [root, out] = process.argv.slice(2);
if (!root) { console.error("usage: node eval/cull-page-previews.mjs DIR [OUT]"); process.exit(2); }
if (out) mkdirSync(out, { recursive: true });

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (isCandidateFile(n) && !/\.jpe?g$/i.test(n)) files.push(p);
  }
})(root);
files.sort();

console.log(["file", "format", "ms", "preview_w", "preview_h", "source", "make", "model", "iso", "exposure", "f", "captured", "orientation"].join("\t"));
let i = 0;
for (const f of files) {
  const bytes = readFileSync(f);
  const t0 = performance.now();
  let r;
  try { r = readRaw(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), basename(f)); }
  catch (e) { console.log([f.slice(root.length + 1), "ERROR", "", "", "", String(e.message)].join("\t")); continue; }
  const ms = (performance.now() - t0).toFixed(1);
  const p = r.preview, m = r.meta;
  if (p && out) writeFileSync(join(out, `${String(i).padStart(4, "0")}_${p.width}x${p.height}.jpg`), bytes.subarray(p.offset, p.offset + p.length));
  i++;
  console.log([
    f.slice(root.length + 1), r.format, ms, p ? p.width : "", p ? p.height : "", p ? p.source : "NONE",
    m.make ?? "", m.model ?? "", m.iso ?? "", m.exposureTime ?? "", m.fNumber ?? "", m.captured ?? "", m.orientation,
  ].join("\t"));
}
