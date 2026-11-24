// Develops the Olympus compacts' packed ORFs (and any other raw findMosaic
// reads) the way the cull page's worker does, with and without the colour fit
// to the camera's own thumbnail, and writes each result for
// eval/cull-orf-compacts-check.py to score against LibRaw.
//   node eval/cull-orf-compacts.mjs OUT FILE...
// Needs OUT/<stem>.thumb.rgba + .json (the thumbnail decoded by the check
// script's `thumbs` step) for the fitted run; without them only the plain run.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readRaw } from "../site/rawpreview.mjs";
import { findMosaic, decodeMosaic, developMosaic } from "../site/rawmosaic.mjs";

const [out, ...files] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const stem = path.basename(f).replace(/\.[^.]+$/, "");
  const b = new Uint8Array(fs.readFileSync(f));
  const r = readRaw(b, f);
  const p = r.preview;
  if (p) fs.writeFileSync(path.join(out, `${stem}.thumb.jpg`), b.subarray(p.offset, p.offset + p.length));
  const m = findMosaic(b);
  if (!m) { console.log(JSON.stringify({ file: stem, mosaic: false })); continue; }
  const mos = decodeMosaic(m);
  const sha = crypto.createHash("sha256").update(Buffer.from(mos.data.buffer, mos.data.byteOffset, mos.data.byteLength)).digest("hex");
  const row = { file: stem, mosaic: true, sensor: [mos.width, mos.height], sensels_sha256: sha, embedded: p ? [p.width, p.height, p.source] : null };
  const tj = path.join(out, `${stem}.thumb.json`);
  const runs = { plain: null };
  if (fs.existsSync(tj)) {
    const meta = JSON.parse(fs.readFileSync(tj, "utf8"));
    runs.fit = { width: meta.width, height: meta.height, rgba: new Uint8ClampedArray(fs.readFileSync(path.join(out, `${stem}.thumb.rgba`))) };
  }
  for (const [name, reference] of Object.entries(runs)) {
    const t0 = performance.now();
    const d = developMosaic(b, { reference, fitMode: process.env.FIT_MODE || "generic" });
    const ms = performance.now() - t0;
    fs.writeFileSync(path.join(out, `${stem}.${name}.rgba`), d.rgba);
    row[name] = { width: d.width, height: d.height, gain: d.gain, wb: d.wb, colour: d.colour, M: d.M, notes: d.notes, ms: Math.round(ms) };
  }
  console.log(JSON.stringify(row));
}
