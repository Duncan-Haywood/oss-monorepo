#!/usr/bin/env node
// Weighs a built Pages artifact for the static-framework R&D note
// (docs/reports/static-framework-rd-2026-10-29.md): how many pages, how
// heavy, and how much of each page is inline CSS/JS that other pages repeat.
//
//   node platform/pages/build.mjs --out=/tmp/dist --audio-cdn
//   node docs/reports/assets/static-framework/measure.mjs /tmp/dist
//
// Prints JSON. Regex extraction, not a parser: good enough to count bytes,
// not to rewrite anything.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const dist = process.argv[2];
if (!dist) {
  console.error("usage: measure.mjs <dist>");
  process.exit(2);
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const byExt = new Map();
const html = [];
for await (const p of walk(dist)) {
  const ext = extname(p).toLowerCase() || "(none)";
  const { size } = await stat(p);
  const row = byExt.get(ext) || { files: 0, bytes: 0 };
  row.files++;
  row.bytes += size;
  byExt.set(ext, row);
  if (ext === ".html") html.push(p);
}

const blocks = new Map(); // sha -> { kind, bytes, pages }
const pages = [];
const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT = /<script\b(?![^>]*\bsrc=)(?![^>]*type=["']application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/gi;
const EXT_SCRIPT = /<script\b[^>]*\bsrc=/gi;
const EXT_CSS = /<link\b[^>]*rel=["']?stylesheet/gi;

for (const p of html) {
  const text = await readFile(p, "utf8");
  const bytes = Buffer.byteLength(text);
  let css = 0, js = 0;
  for (const [kind, re] of [["css", STYLE], ["js", SCRIPT]]) {
    for (const m of text.matchAll(re)) {
      const body = m[1];
      if (!body.trim()) continue;
      const n = Buffer.byteLength(body);
      if (kind === "css") css += n; else js += n;
      const h = createHash("sha256").update(kind).update(body).digest("hex");
      const b = blocks.get(h) || { kind, bytes: n, pages: 0 };
      b.pages++;
      blocks.set(h, b);
    }
  }
  pages.push({
    p: p.slice(dist.length),
    bytes,
    gz: gzipSync(text).length,
    css,
    js,
    extJs: (text.match(EXT_SCRIPT) || []).length,
    extCss: (text.match(EXT_CSS) || []).length,
  });
}

const q = (xs, f) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const col = (k) => pages.map((r) => r[k]);

// Inline bytes that a shared, cached file would have sent once.
let inlineTotal = 0, inlineRepeated = 0, sharedBlocks = 0;
const top = [];
for (const b of blocks.values()) {
  inlineTotal += b.bytes * b.pages;
  if (b.pages > 1) {
    inlineRepeated += b.bytes * (b.pages - 1);
    sharedBlocks++;
    top.push({ kind: b.kind, bytes: b.bytes, pages: b.pages, repeatedBytes: b.bytes * (b.pages - 1) });
  }
}
top.sort((a, b) => b.repeatedBytes - a.repeatedBytes);

const out = {
  dist,
  files: sum([...byExt.values()].map((r) => r.files)),
  bytes: sum([...byExt.values()].map((r) => r.bytes)),
  byExt: Object.fromEntries([...byExt].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12)),
  htmlPages: pages.length,
  html: {
    bytes: { p50: q(col("bytes"), 0.5), p90: q(col("bytes"), 0.9), p99: q(col("bytes"), 0.99), max: Math.max(...col("bytes")), total: sum(col("bytes")) },
    gzip: { p50: q(col("gz"), 0.5), p90: q(col("gz"), 0.9), p99: q(col("gz"), 0.99), total: sum(col("gz")) },
    inlineCss: { p50: q(col("css"), 0.5), p90: q(col("css"), 0.9), total: sum(col("css")) },
    inlineJs: { p50: q(col("js"), 0.5), p90: q(col("js"), 0.9), total: sum(col("js")) },
    pagesWithExternalJs: pages.filter((r) => r.extJs).length,
    pagesWithExternalCss: pages.filter((r) => r.extCss).length,
  },
  inlineBlocks: {
    distinct: blocks.size,
    sharedByTwoOrMorePages: sharedBlocks,
    totalInlineBytes: inlineTotal,
    repeatedInlineBytes: inlineRepeated,
    top: top.slice(0, 8),
  },
  heaviest: [...pages].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map(({ p, bytes, gz }) => ({ p, bytes, gz })),
};
console.log(JSON.stringify(out, null, 2));
