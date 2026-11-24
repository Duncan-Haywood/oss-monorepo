// Reads the AF point from each raw's maker note with site/rawpreview.mjs and
// writes the preview JPEG plus a JSON line per file, so
// eval/cull-af-point-detail.py can measure detail at the point.
//
//   git clone --depth 1 --filter=blob:none --sparse \
//     https://github.com/drewnoakes/metadata-extractor-images.git mei
//   (cd mei && git sparse-checkout set arw cr2 cr3 nef orf raf rw2)
//   node eval/cull-af-point.mjs mei OUT > OUT/af.jsonl
//   python3 eval/cull-af-point-detail.py OUT/af.jsonl     # needs numpy, Pillow
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readRaw, isCandidateFile } from "../site/rawpreview.mjs";

const [root, out] = process.argv.slice(2);
if (!root || !out) { console.error("usage: node eval/cull-af-point.mjs DIR OUT"); process.exit(2); }
mkdirSync(out, { recursive: true });
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== ".git" && n !== "metadata") walk(p); }
    else if (isCandidateFile(n) && !/\.jpe?g$/i.test(n)) files.push(p);
  }
})(root);
files.sort();
let i = 0;
for (const f of files) {
  const bytes = readFileSync(f);
  let r;
  try { r = readRaw(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), f); } catch (e) { continue; }
  const name = f.slice(root.length + 1);
  const row = { file: name, make: r.meta.make || "", model: r.meta.model || "", af: r.meta.af || null };
  if (r.preview) {
    const jpg = join(out, `${String(i++).padStart(4, "0")}.jpg`);
    writeFileSync(jpg, bytes.subarray(r.preview.offset, r.preview.offset + r.preview.length));
    row.jpg = jpg;
  }
  console.log(JSON.stringify(row));
}
