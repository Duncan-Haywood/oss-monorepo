// Bytes a page makes the browser fetch: every module its inline <script type="module"> imports, followed
// import by import, summed raw and gzipped one file at a time (as a server compresses each response).
// Usage: node eval/page-weight.mjs <venture dir> <page.html> [...]   (eval/page-weight.txt holds a run)
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const dir = process.argv[2];
const closure = (starts) => { const seen = new Set(); const todo = [...starts];
  while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*"\.\/([\w./-]+\.mjs)"/gm)) todo.push(path.normalize(path.join(path.dirname(f), m[1]))); }
  return seen; };
for (const page of process.argv.slice(3)) {
  const html = fs.readFileSync(path.join(dir, page), "utf8");
  const starts = [...html.matchAll(/^\s*import [^;]*? from "\.\/([^"]+)"/gm)].map((m) => m[1]);
  const set = closure(starts); let raw = 0, gz = 0;
  for (const f of set) { const b = fs.readFileSync(path.join(dir, f)); raw += b.length; gz += zlib.gzipSync(b).length; }
  console.log(page.padEnd(40), String(set.size).padStart(3), "modules", (raw/1024).toFixed(0).padStart(5), "kB", (gz/1024).toFixed(0).padStart(4), "kB gz");
}
