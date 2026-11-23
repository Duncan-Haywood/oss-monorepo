// Checks readRawFile (the cull page's sparse reader) against readRaw on the
// whole file, for every raw under DIR: the same preview (offset, length, size,
// source), the same metadata and orientation. Reports the bytes each read.
//
//   node eval/cull-sparse-read.mjs DIR > report.tsv
import { readFileSync, readdirSync, statSync, openAsBlob } from "node:fs";
import { join, basename } from "node:path";
import { readRaw, readRawFile, isCandidateFile } from "../site/rawpreview.mjs";

const root = process.argv[2];
if (!root) { console.error("usage: node eval/cull-sparse-read.mjs DIR"); process.exit(2); }
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n), s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (isCandidateFile(n) && !/\.jpe?g$/i.test(n)) files.push(p);
  }
})(root);
files.sort();

const key = (r) => JSON.stringify({ format: r.format, meta: r.meta, preview: r.preview });
console.log(["file", "size", "bytes_read", "share", "passes", "sparse", "ms_sparse", "same"].join("\t"));
let total = 0, read = 0, same = 0, sparse = 0;
for (const f of files) {
  const bytes = readFileSync(f);
  const full = readRaw(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), basename(f));
  const blob = await openAsBlob(f);
  const file = Object.assign(blob, { name: basename(f) });
  const t0 = performance.now();
  const r = await readRawFile(file);
  const ms = (performance.now() - t0).toFixed(1);
  const ok = key(r) === key(full);
  total += bytes.length; read += r.bytesRead; same += ok; sparse += r.sparse;
  console.log([f.slice(root.length + 1), bytes.length, r.bytesRead, (r.bytesRead / bytes.length).toFixed(4), r.passes, r.sparse, ms, ok ? "yes" : "NO"].join("\t"));
}
console.error(`${files.length} files, ${same} identical to a whole read, ${sparse} read sparsely; ${(read / 2 ** 20).toFixed(1)} of ${(total / 2 ** 20).toFixed(1)} MiB read (${(100 * read / total).toFixed(2)}%)`);
