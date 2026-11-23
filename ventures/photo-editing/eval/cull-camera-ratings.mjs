// Reads every raw under DIR with readRaw (whole file) and readRawFile (sparse),
// prints the in-camera rating each finds, plus an independent byte scan of
// the file for XMP Rating text, so the two readers can be compared.
//   node eval/cull-camera-ratings.mjs DIR > report.tsv
import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { readRaw, readRawFile, isCandidateFile } from "../site/rawpreview.mjs";

const dir = process.argv[2];
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (isCandidateFile(n) && !/\.jpe?g$/i.test(n)) files.push(p); } };
walk(dir);
files.sort();

// A File-like over a path, so readRawFile reads byte ranges as the page does.
const fileOf = (p) => ({
  name: basename(p), size: statSync(p).size,
  slice(a, z) { return { arrayBuffer: async () => { const fd = openSync(p, "r"); const out = Buffer.alloc(z - a); readSync(fd, out, 0, z - a, a); closeSync(fd); return out.buffer.slice(out.byteOffset, out.byteOffset + out.length); } }; },
  arrayBuffer: async () => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
});

console.log(["file", "make", "model", "whole_rating", "whole_label", "sparse_rating", "sparse_label", "same", "scan_xmp_packets", "scan_ratings"].join("\t"));
for (const p of files) {
  const buf = readFileSync(p);
  let w, s;
  try { w = readRaw(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), basename(p)); } catch (e) { w = { meta: {}, err: e.message }; }
  try { s = await readRawFile(fileOf(p)); } catch (e) { s = { meta: {}, err: e.message }; }
  // Independent: every "<x:xmpmeta" packet in the bytes, and the Rating values written in them.
  const text = buf.toString("latin1");
  const packets = (text.match(/<x:xmpmeta/g) || []).length;
  const ratings = [...text.matchAll(/xmp:Rating(?:="|>)(-?[\d.]+)/g)].map((m) => m[1]);
  const wr = w.meta.cameraRating ?? "", wl = w.meta.cameraLabel ?? "", sr = s.meta.cameraRating ?? "", sl = s.meta.cameraLabel ?? "";
  console.log([p.slice(dir.length + 1), w.meta.make || "", w.meta.model || "", wr, wl, sr, sl, wr === sr && wl === sl ? 1 : 0, packets, ratings.join(",")].join("\t"));
}
